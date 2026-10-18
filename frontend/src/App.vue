<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Person = { id: string; name: string };
type Task = {
  id: number;
  columnId: number;
  title: string;
  description: string | null;
  position: number;
  responsible: Person | null;
  storekeeper: Person | null;
  driver: Person | null;
  telegramMessageText: string | null;
};
type Column = { id: number; title: string; slug: string; position: number; tasks: Task[] };

const columns = ref<Column[]>([]);
const title = ref('');
const description = ref('');
const showTaskDetails = ref(false);
const siteName = ref('');
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
const hiddenReadyCount = computed(() => isAfterReadyCutoff.value
  ? columns.value.find((column) => column.slug === 'ready')?.tasks.length ?? 0
  : 0);

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-name': encodeURIComponent(siteName.value.trim() || 'Оператор'),
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function visibleTasks(column: Column) {
  return column.slug === 'ready' && isAfterReadyCutoff.value ? [] : column.tasks;
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

function saveSiteName() {
  const clean = siteName.value.trim().slice(0, 160);
  siteName.value = clean || 'Оператор';
  localStorage.setItem('kanban-user-name', siteName.value);
}

async function createTask() {
  const cleanTitle = title.value.trim();
  if (!cleanTitle || !firstColumnId.value) return;
  try {
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
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось создать заказ';
  }
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
  if (!editTitle.value.trim()) return;
  try {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: editTitle.value.trim(), description: editDescription.value.trim() })
    });
    cancelEdit();
    await loadBoard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить заказ';
  }
}

async function moveTask(columnId: number, position: number) {
  if (!draggedTask.value) return;
  try {
    await api(`/tasks/${draggedTask.value.id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ columnId, position })
    });
    await loadBoard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось изменить стадию заказа';
  } finally {
    draggedTask.value = null;
  }
}

async function deleteTask(taskId: number) {
  if (!window.confirm('Удалить заказ?')) return;
  try {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
    await loadBoard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось удалить заказ';
  }
}

onMounted(() => {
  siteName.value = localStorage.getItem('kanban-user-name') || 'Оператор';
  clock = window.setInterval(() => { now.value = new Date(); }, 30_000);
  void loadBoard();
});

onBeforeUnmount(() => {
  if (clock) window.clearInterval(clock);
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
        <label class="operator-field">
          <span>Вы</span>
          <input v-model="siteName" maxlength="160" @change="saveSiteName" />
        </label>
        <button class="ghost-button" type="button" @click="loadBoard">Обновить</button>
      </div>
    </header>

    <p v-if="error" class="error-note">{{ error }}</p>
    <p v-if="hiddenReadyCount" class="cutoff-note">Готовые заказы скрыты после 18:00: {{ hiddenReadyCount }}</p>
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
          <textarea v-if="showTaskDetails" v-model="description" maxlength="1000" placeholder="Комментарий"></textarea>
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
                  <div v-if="task.responsible"><dt>Ответственный</dt><dd>{{ task.responsible.name }}</dd></div>
                  <div v-if="task.storekeeper"><dt>Кладовщик</dt><dd>{{ task.storekeeper.name }}</dd></div>
                  <div v-if="task.driver"><dt>Водитель</dt><dd>{{ task.driver.name }}</dd></div>
                </dl>
                <details v-if="task.telegramMessageText" class="source-message">
                  <summary>Исходное сообщение</summary>
                  <p>{{ task.telegramMessageText }}</p>
                </details>
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
