<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Person = { id: string; name: string };
type Task = {
  id: number;
  columnId: number;
  orderType: 'income' | 'expense' | 'store';
  title: string;
  description: string | null;
  position: number;
  responsible: Person | null;
  storekeeper: Person | null;
  driver: Person | null;
  telegramMessageText: string | null;
  readyAt: string | null;
  createdAt: string;
};
type Column = { id: number; title: string; slug: string; orderType: 'income' | 'expense' | 'store'; position: number; tasks: Task[] };

const columns = ref<Column[]>([]);
const orderType = ref<'income' | 'expense' | 'store'>('expense');
const selectedColumnId = ref<number | null>(null);
const title = ref('');
const description = ref('');
const siteName = ref('');
const loading = ref(true);
const error = ref('');
const draggedTask = ref<Task | null>(null);
const editingTaskId = ref<number | null>(null);
const editTitle = ref('');
const editDescription = ref('');
const now = ref(new Date());
let clock: number | undefined;

const visibleColumns = computed(() => columns.value.filter((column) => column.orderType === orderType.value));
const firstColumnId = computed(() => visibleColumns.value.find((column) => column.slug === 'created')?.id ?? null);
const isAfterReadyCutoff = computed(() => moscowHour(now.value) >= 18);

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
  if (column.slug !== 'ready') return column.tasks;
  if (isAfterReadyCutoff.value) return [];
  return column.tasks.filter((task) => isToday(task.readyAt));
}

function isToday(value: string | Date | null) {
  if (!value) return false;
  return moscowDateKey(new Date(value)) === moscowDateKey(now.value);
}

function moscowDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function moscowHour(date: Date) {
  return Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).find((part) => part.type === 'hour')?.value ?? 0);
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

async function loadBoard() {
  loading.value = true;
  error.value = '';
  try {
    const board = await api<{ columns: Column[] }>('/board');
    columns.value = board.columns;
    if (!visibleColumns.value.some((column) => column.id === selectedColumnId.value)) {
      selectedColumnId.value = firstColumnId.value;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить доску';
  } finally {
    loading.value = false;
  }
}

function selectOrderType(value: 'income' | 'expense' | 'store') {
  orderType.value = value;
  selectedColumnId.value = columns.value.find((column) => column.orderType === value && column.slug === 'created')?.id ?? null;
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
        orderType: orderType.value,
        columnId: firstColumnId.value
      })
    });
    title.value = '';
    description.value = '';
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

async function moveTaskTo(task: Task, columnId: number) {
  if (task.columnId === columnId) return;
  const targetColumn = columns.value.find((column) => column.id === columnId);
  if (!targetColumn) return;
  try {
    await api(`/tasks/${task.id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ columnId, position: visibleTasks(targetColumn).length })
    });
    selectedColumnId.value = columnId;
    await loadBoard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось изменить стадию заказа';
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
    <p v-if="loading" class="state">Загружаю доску...</p>

    <nav v-if="!loading && columns.length" class="order-type-tabs" role="tablist" aria-label="Тип заказов">
      <button type="button" role="tab" :aria-selected="orderType === 'expense'" :class="{ active: orderType === 'expense' }" @click="selectOrderType('expense')">Расход</button>
      <button type="button" role="tab" :aria-selected="orderType === 'income'" :class="{ active: orderType === 'income' }" @click="selectOrderType('income')">Приход</button>
      <button type="button" role="tab" :aria-selected="orderType === 'store'" :class="{ active: orderType === 'store' }" @click="selectOrderType('store')">На магазин</button>
    </nav>

    <nav v-if="!loading && visibleColumns.length" class="mobile-stage-tabs" role="tablist" aria-label="Стадии заказов">
      <button
        v-for="column in visibleColumns"
        :key="column.id"
        type="button"
        role="tab"
        :aria-selected="selectedColumnId === column.id"
        :class="{ active: selectedColumnId === column.id }"
        @click="selectedColumnId = column.id"
      >
        <span>{{ column.title }}</span>
        <span class="tab-count">{{ visibleTasks(column).length }}</span>
      </button>
    </nav>

    <section
      v-if="!loading"
      class="board"
      :style="{ '--column-count': visibleColumns.length }"
      :aria-label="`Канбан: ${orderType === 'income' ? 'приход' : orderType === 'store' ? 'на магазин' : 'расход'}`"
    >
      <article
        v-for="column in visibleColumns"
        :key="column.id"
        class="column"
        :class="[`column-${column.slug}`, { 'column-mobile-active': selectedColumnId === column.id }]"
        @dragover.prevent
        @drop="moveTask(column.id, visibleTasks(column).length)"
      >
        <div class="column-header">
          <h2>{{ column.title }}</h2>
          <span>{{ visibleTasks(column).length }}</span>
        </div>

        <form v-if="column.id === firstColumnId" class="column-composer" @submit.prevent="createTask">
          <input v-model="title" maxlength="160" placeholder="Новый заказ" />
          <textarea v-model="description" maxlength="1000" placeholder="Комментарий к заказу (необязательно)"></textarea>
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
                <div class="task-heading">
                  <h3>{{ task.title }}</h3>
                  <time class="task-date" :datetime="task.createdAt">{{ formatOrderDate(task.createdAt) }}</time>
                </div>
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
              <label class="mobile-move-control">
                <span>Стадия</span>
                <select :value="column.id" @change="moveTaskTo(task, Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="stage in visibleColumns" :key="stage.id" :value="stage.id">{{ stage.title }}</option>
                </select>
              </label>
            </template>
          </article>
        </div>
      </article>
    </section>
  </main>
</template>
