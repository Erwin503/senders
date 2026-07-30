<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Person = {
  id: string;
  name: string;
};

type Task = {
  id: number;
  columnId: number;
  title: string;
  description: string | null;
  position: number;
  responsible: Person | null;
  storekeeper: Person | null;
  driver: Person | null;
};

type Column = {
  id: number;
  title: string;
  slug: string;
  position: number;
  tasks: Task[];
};

const columns = ref<Column[]>([]);
const title = ref('');
const description = ref('');
const showTaskDetails = ref(false);
const loading = ref(true);
const error = ref('');
const draggedTask = ref<Task | null>(null);
const editingTaskId = ref<number | null>(null);
const editTitle = ref('');
const editDescription = ref('');
const now = ref(new Date());

let clock: number | undefined;

const firstColumnId = computed(() => columns.value[0]?.id ?? null);
const isAfterReadyCutoff = computed(() => now.value.getHours() >= 18);
const currentUserName = computed(() => {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();

  return fullName || user?.username || 'Local User';
});
const hiddenReadyCount = computed(() => {
  if (!isAfterReadyCutoff.value) {
    return 0;
  }

  return columns.value.find((column) => column.slug === 'ready')?.tasks.length ?? 0;
});

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const initData = window.Telegram?.WebApp?.initData;

  if (initData) {
    headers['x-telegram-init-data'] = initData;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function visibleTasks(column: Column) {
  if (column.slug === 'ready' && isAfterReadyCutoff.value) {
    return [];
  }

  return column.tasks;
}

async function loadBoard() {
  loading.value = true;
  error.value = '';
  try {
    const board = await api<{ columns: Column[] }>('/board');
    columns.value = board.columns;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить доску';
  } finally {
    loading.value = false;
  }
}

async function createTask() {
  const cleanTitle = title.value.trim();
  if (!cleanTitle) {
    return;
  }

  await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: cleanTitle,
      description: description.value.trim() || undefined,
      columnId: firstColumnId.value
    })
  });

  title.value = '';
  description.value = '';
  showTaskDetails.value = false;
  await loadBoard();
}

function startEdit(task: Task) {
  editingTaskId.value = task.id;
  editTitle.value = task.title;
  editDescription.value = task.description ?? '';
}

function cancelEdit() {
  editingTaskId.value = null;
  editTitle.value = '';
  editDescription.value = '';
}

async function saveEdit(taskId: number) {
  const cleanTitle = editTitle.value.trim();
  if (!cleanTitle) {
    return;
  }

  await api(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: cleanTitle,
      description: editDescription.value.trim()
    })
  });

  cancelEdit();
  await loadBoard();
}

async function moveTask(columnId: number, position: number) {
  if (!draggedTask.value) {
    return;
  }

  await api(`/tasks/${draggedTask.value.id}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ columnId, position })
  });
  draggedTask.value = null;
  await loadBoard();
}

async function deleteTask(taskId: number) {
  await api(`/tasks/${taskId}`, { method: 'DELETE' });
  await loadBoard();
}

onMounted(async () => {
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand();
  clock = window.setInterval(() => {
    now.value = new Date();
  }, 30_000);
  await loadBoard();
});

onBeforeUnmount(() => {
  if (clock) {
    window.clearInterval(clock);
  }
});
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Заказы</p>
        <h1>Канбан</h1>
      </div>
      <div class="topbar-actions">
        <span class="user-pill">{{ currentUserName }}</span>
        <button class="ghost-button" type="button" @click="loadBoard">Обновить</button>
      </div>
    </header>


    <p v-if="error" class="error-note">{{ error }}</p>
    <p v-if="hiddenReadyCount" class="cutoff-note">
      Готовые заказы скрыты после 18:00: {{ hiddenReadyCount }}
    </p>

    <p v-if="loading" class="state">Загружаю доску...</p>

    <section v-else class="board" aria-label="Канбан заказов">
      <article
        v-for="column in columns"
        :key="column.id"
        class="column"
        :class="`column-${column.slug}`"
        @dragover.prevent
        @drop="moveTask(column.id, visibleTasks(column).length)"
      >
        <div class="column-header">
          <h2>{{ column.title }}</h2>
          <span>{{ visibleTasks(column).length }}</span>
        </div>

        <form v-if="column.id === firstColumnId" class="column-composer" @submit.prevent="createTask">
          <input v-model="title" maxlength="160" placeholder="Новый заказ" />
          <button class="details-toggle" type="button" @click="showTaskDetails = !showTaskDetails">
            {{ showTaskDetails ? 'Скрыть детали' : 'Детали' }}
          </button>
          <textarea
            v-if="showTaskDetails"
            v-model="description"
            maxlength="1000"
            placeholder="Комментарий, состав, адрес"
          ></textarea>
          <button class="composer-submit" type="submit">Добавить</button>
        </form>

        <div class="task-list">
          <article
            v-for="(task, index) in visibleTasks(column)"
            :key="task.id"
            class="task-card"
            draggable="true"
            @dragstart="draggedTask = task"
            @drop.stop="moveTask(column.id, index)"
            @dragover.prevent
          >
            <form v-if="editingTaskId === task.id" class="edit-form" @submit.prevent="saveEdit(task.id)">
              <input v-model="editTitle" maxlength="160" />
              <textarea v-model="editDescription" maxlength="1000"></textarea>
              <div class="card-actions">
                <button class="primary-action" type="submit">Сохранить</button>
                <button class="ghost-action" type="button" @click="cancelEdit">Отмена</button>
              </div>
            </form>

            <template v-else>
              <div class="task-content">
                <h3>{{ task.title }}</h3>
                <p v-if="task.description">{{ task.description }}</p>
                <dl class="people-list">
                  <div v-if="task.responsible">
                    <dt>Ответственный</dt>
                    <dd>{{ task.responsible.name }}</dd>
                  </div>
                  <div v-if="task.storekeeper">
                    <dt>Кладовщик</dt>
                    <dd>{{ task.storekeeper.name }}</dd>
                  </div>
                  <div v-if="task.driver">
                    <dt>Водитель</dt>
                    <dd>{{ task.driver.name }}</dd>
                  </div>
                </dl>
              </div>
              <div class="card-actions">
                <button class="ghost-action" type="button" @click="startEdit(task)">Изменить</button>
                <button class="danger-action" type="button" @click="deleteTask(task.id)">Удалить</button>
              </div>
            </template>
          </article>
        </div>
      </article>
    </section>
  </main>
</template>