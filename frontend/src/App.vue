<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Person = { id: string | number; name: string };
type UserRole = 'admin' | 'manager' | 'driver' | 'storekeeper';
type AuthUser = { id: number; username: string; name: string; role: UserRole };
type OrderTemplate = {
  id: number;
  ownerAdminId: number;
  ownerName: string;
  orderType: 'income' | 'expense' | 'store';
  address: string;
  description: string | null;
  activeAt: string | null;
};
type Task = {
  id: number;
  columnId: number;
  orderType: 'income' | 'expense' | 'store';
  title: string;
  description: string | null;
  activeAt: string | null;
  isActive: boolean;
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
const currentUser = ref<AuthUser | null>(null);
const attentionCounts = ref({ expense: 0, income: 0, store: 0 });
const orderType = ref<'income' | 'expense' | 'store'>('expense');
const selectedColumnId = ref<number | null>(null);
const title = ref('');
const description = ref('');
const activeAtInput = ref('');
const loading = ref(true);
const error = ref('');
const authMode = ref<'login' | 'register'>('login');
const authUsername = ref('');
const authDisplayName = ref('');
const authPassword = ref('');
const authError = ref('');
const templatesOpen = ref(false);
const templates = ref<OrderTemplate[]>([]);
const admins = ref<Person[]>([]);
const templateEditingId = ref<number | null>(null);
const templateOwnerAdminId = ref<number | null>(null);
const templateOrderType = ref<'income' | 'expense' | 'store'>('expense');
const templateAddress = ref('');
const templateDescription = ref('');
const templateActiveAt = ref('');
const usersOpen = ref(false);
const users = ref<AuthUser[]>([]);
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
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    let friendlyMessage = message;
    try {
      const parsed = JSON.parse(message) as { message?: string | string[] };
      friendlyMessage = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message || message;
    } catch { /* Keep the original response when it is not JSON. */ }
    throw new Error(friendlyMessage || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function visibleTasks(column: Column) {
  let tasks = column.tasks;
  if (column.slug === 'ready') {
    if (isAfterReadyCutoff.value) return [];
    tasks = tasks.filter((task) => isToday(task.readyAt));
  }
  return [...tasks].sort((left, right) => Number(!isTaskActive(left)) - Number(!isTaskActive(right))
    || left.position - right.position);
}

function isTaskActive(task: Task) {
  return !task.activeAt || new Date(task.activeAt).getTime() <= now.value.getTime();
}

function formatActivationTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
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
  if (!currentUser.value) return;
  loading.value = true;
  error.value = '';
  try {
    const board = await api<{ columns: Column[]; attentionCounts: typeof attentionCounts.value }>('/board');
    columns.value = board.columns;
    attentionCounts.value = board.attentionCounts;
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

function roleName(role: UserRole) {
  return { admin: 'Администратор', manager: 'Менеджер', driver: 'Водитель', storekeeper: 'Кладовщик' }[role];
}

function showAttentionCount(orderType: 'income' | 'expense' | 'store') {
  if (!currentUser.value || ['admin', 'manager'].includes(currentUser.value.role)) return false;
  return currentUser.value.role === 'storekeeper' || orderType !== 'store';
}

async function submitAuth() {
  authError.value = '';
  try {
    const path = authMode.value === 'login' ? '/auth/login' : '/auth/register';
    const payload = authMode.value === 'login'
      ? { username: authUsername.value, password: authPassword.value }
      : { username: authUsername.value, displayName: authDisplayName.value.trim() || undefined, password: authPassword.value };
    currentUser.value = await api<AuthUser>(path, { method: 'POST', body: JSON.stringify(payload) });
    authPassword.value = '';
    await loadBoard();
  } catch (caught) {
    authError.value = caught instanceof Error ? caught.message : 'Не удалось выполнить вход';
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear the local view even when the session already expired. */ } finally {
    currentUser.value = null;
    columns.value = [];
    attentionCounts.value = { expense: 0, income: 0, store: 0 };
  }
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function openTemplates() {
  templatesOpen.value = true;
  templateEditingId.value = null;
  try {
    const [items, owners] = await Promise.all([
      api<OrderTemplate[]>('/templates'),
      api<Person[]>('/auth/admins')
    ]);
    templates.value = items;
    admins.value = owners;
    templateOwnerAdminId.value = currentUser.value?.role === 'admin'
      ? currentUser.value.id
      : owners[0]?.id ? Number(owners[0].id) : null;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить шаблоны';
  }
}

function resetTemplateForm() {
  templateEditingId.value = null;
  templateOrderType.value = 'expense';
  templateAddress.value = '';
  templateDescription.value = '';
  templateActiveAt.value = '';
  templateOwnerAdminId.value = currentUser.value?.role === 'admin'
    ? currentUser.value.id
    : admins.value[0]?.id ? Number(admins.value[0].id) : null;
}

function editTemplate(template: OrderTemplate) {
  templateEditingId.value = template.id;
  templateOwnerAdminId.value = template.ownerAdminId;
  templateOrderType.value = template.orderType;
  templateAddress.value = template.address;
  templateDescription.value = template.description ?? '';
  templateActiveAt.value = localDateTime(template.activeAt);
}

async function saveTemplate() {
  if (!templateAddress.value.trim()) return;
  const payload = {
    ownerAdminId: templateOwnerAdminId.value ?? undefined,
    orderType: templateOrderType.value,
    address: templateAddress.value.trim(),
    description: templateDescription.value.trim() || undefined,
    activeAt: templateActiveAt.value ? new Date(templateActiveAt.value).toISOString() : null
  };
  try {
    const path = templateEditingId.value ? `/templates/${templateEditingId.value}` : '/templates';
    await api(path, { method: templateEditingId.value ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    await openTemplates();
    resetTemplateForm();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить шаблон';
  }
}

async function removeTemplate(id: number) {
  if (!window.confirm('Удалить шаблон?')) return;
  try {
    await api(`/templates/${id}`, { method: 'DELETE' });
    templates.value = templates.value.filter((template) => template.id !== id);
    if (templateEditingId.value === id) resetTemplateForm();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось удалить шаблон';
  }
}

async function createFromTemplate(template: OrderTemplate) {
  try {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: template.address,
        description: template.description || undefined,
        orderType: template.orderType,
        activeAt: template.activeAt ? new Date(template.activeAt).toISOString() : undefined
      })
    });
    selectOrderType(template.orderType);
    templatesOpen.value = false;
    await loadBoard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось создать заказ из шаблона';
  }
}

async function openUsers() {
  usersOpen.value = true;
  try { users.value = await api<AuthUser[]>('/auth/users'); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить пользователей'; }
}

async function changeRole(user: AuthUser, role: UserRole) {
  try {
    const updated = await api<AuthUser>(`/auth/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    users.value = users.value.map((item) => item.id === user.id ? updated : item);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось изменить роль';
    await openUsers();
  }
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
        columnId: firstColumnId.value,
        activeAt: activeAtInput.value ? new Date(activeAtInput.value).toISOString() : undefined
      })
    });
    title.value = '';
    description.value = '';
    activeAtInput.value = '';
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
  if (!draggedTask.value || !isTaskActive(draggedTask.value)) return;
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
  if (task.columnId === columnId || !isTaskActive(task)) return;
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
  clock = window.setInterval(() => { now.value = new Date(); }, 30_000);
  void api<AuthUser>('/auth/me').then(async (user) => {
    currentUser.value = user;
    await loadBoard();
  }).catch(() => {
    currentUser.value = null;
    loading.value = false;
  });
});

onBeforeUnmount(() => {
  if (clock) window.clearInterval(clock);
});
</script>

<template>
  <main v-if="!currentUser" class="auth-shell">
    <section class="auth-panel">
      <p class="eyebrow">Управление заказами</p>
      <h1 class="brand-title">Standatriks</h1>
      <h2>{{ authMode === 'login' ? 'Вход' : 'Регистрация' }}</h2>
      <form class="auth-form" @submit.prevent="submitAuth">
        <label>
          <span>Логин</span>
          <input v-model="authUsername" autocomplete="username" minlength="3" maxlength="80" required />
        </label>
        <label v-if="authMode === 'register'">
          <span>Имя</span>
          <input v-model="authDisplayName" autocomplete="name" maxlength="160" />
        </label>
        <label>
          <span>Пароль</span>
          <input v-model="authPassword" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" type="password" minlength="10" maxlength="128" required />
        </label>
        <p v-if="authError" class="error-note">{{ authError }}</p>
        <button class="composer-submit" type="submit">{{ authMode === 'login' ? 'Войти' : 'Создать аккаунт' }}</button>
      </form>
      <button class="auth-switch" type="button" @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''">
        {{ authMode === 'login' ? 'Зарегистрироваться' : 'Уже есть аккаунт? Войти' }}
      </button>
    </section>
  </main>

  <main v-else class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Управление заказами</p>
        <h1 class="brand-title">Standatriks</h1>
      </div>
      <div class="topbar-actions">
        <div class="user-summary">
          <strong>{{ currentUser.name }}</strong>
          <span>{{ roleName(currentUser.role) }}</span>
        </div>
        <button v-if="currentUser.role === 'admin'" class="ghost-button" type="button" @click="openUsers">Пользователи</button>
        <button class="ghost-button" type="button" @click="loadBoard">Обновить</button>
        <button class="ghost-button" type="button" @click="logout">Выйти</button>
      </div>
    </header>

    <p v-if="error" class="error-note">{{ error }}</p>
    <p v-if="loading" class="state">Загружаю доску...</p>

    <nav v-if="!loading && columns.length" class="order-type-tabs" role="tablist" aria-label="Тип заказов">
      <button type="button" role="tab" :aria-selected="orderType === 'expense'" :class="{ active: orderType === 'expense' }" @click="selectOrderType('expense')"><span>Расход</span><span v-if="showAttentionCount('expense')" class="attention-count">{{ attentionCounts.expense }}</span></button>
      <button type="button" role="tab" :aria-selected="orderType === 'income'" :class="{ active: orderType === 'income' }" @click="selectOrderType('income')"><span>Приход</span><span v-if="showAttentionCount('income')" class="attention-count">{{ attentionCounts.income }}</span></button>
      <button type="button" role="tab" :aria-selected="orderType === 'store'" :class="{ active: orderType === 'store' }" @click="selectOrderType('store')"><span>На магазин</span><span v-if="showAttentionCount('store')" class="attention-count">{{ attentionCounts.store }}</span></button>
    </nav>

    <div v-if="currentUser.role === 'manager' || currentUser.role === 'admin'" class="board-toolbar">
      <button class="template-plus" type="button" aria-label="Открыть шаблоны заказов" title="Шаблоны заказов" @click="openTemplates">+</button>
    </div>

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
          <label class="activation-field">
            <span>Активировать с (необязательно)</span>
            <input v-model="activeAtInput" type="datetime-local" />
          </label>
          <button class="composer-submit" type="submit">Добавить</button>
        </form>

        <div class="task-list">
          <article
            v-for="(task, index) in visibleTasks(column)"
            :key="task.id"
            class="task-card"
            :class="{ scheduled: !isTaskActive(task) }"
            :draggable="isTaskActive(task)"
            @dragstart="draggedTask = isTaskActive(task) ? task : null"
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
                <p v-if="!isTaskActive(task) && task.activeAt" class="scheduled-label">Запланирован на {{ formatActivationTime(task.activeAt) }}</p>
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
                <select :value="column.id" :disabled="!isTaskActive(task)" @change="moveTaskTo(task, Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="stage in visibleColumns" :key="stage.id" :value="stage.id">{{ stage.title }}</option>
                </select>
              </label>
            </template>
          </article>
        </div>
      </article>
    </section>

    <div v-if="templatesOpen" class="modal-backdrop" @click.self="templatesOpen = false">
      <section class="management-modal" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <header class="modal-header">
          <div><p class="eyebrow">Заказы</p><h2 id="templates-title">Шаблоны</h2></div>
          <button class="icon-close" type="button" aria-label="Закрыть" @click="templatesOpen = false">×</button>
        </header>
        <div class="template-layout">
          <form class="template-form" @submit.prevent="saveTemplate">
            <h3>{{ templateEditingId ? 'Изменить шаблон' : 'Новый шаблон' }}</h3>
            <label v-if="currentUser.role === 'manager'" class="form-field"><span>Владелец</span><select v-model.number="templateOwnerAdminId" required><option v-for="admin in admins" :key="admin.id" :value="Number(admin.id)">{{ admin.name }}</option></select></label>
            <label class="form-field"><span>Вид заказа</span><select v-model="templateOrderType"><option value="expense">Расход</option><option value="income">Приход</option><option value="store">На магазин</option></select></label>
            <label class="form-field"><span>Адрес</span><input v-model="templateAddress" maxlength="160" required /></label>
            <label class="form-field"><span>Комментарий</span><textarea v-model="templateDescription" maxlength="1000" rows="3"></textarea></label>
            <label class="form-field"><span>Активировать с</span><input v-model="templateActiveAt" type="datetime-local" /></label>
            <div class="card-actions">
              <button class="primary-action" type="submit">{{ templateEditingId ? 'Сохранить' : 'Добавить' }}</button>
              <button v-if="templateEditingId" class="ghost-action" type="button" @click="resetTemplateForm">Отмена</button>
            </div>
          </form>
          <div class="template-list">
            <article v-for="template in templates" :key="template.id" class="template-row">
              <div class="template-main">
                <span class="template-kind">{{ { expense: 'Расход', income: 'Приход', store: 'На магазин' }[template.orderType] }}<template v-if="currentUser.role === 'manager'"> · {{ template.ownerName }}</template></span>
                <h3>{{ template.address }}</h3>
                <p>{{ template.description || 'Без комментария' }}</p>
                <time v-if="template.activeAt">Активация: {{ formatActivationTime(template.activeAt) }}</time>
              </div>
              <div class="template-actions">
                <button class="primary-action" type="button" @click="createFromTemplate(template)">Создать заказ</button>
                <button class="ghost-action" type="button" @click="editTemplate(template)">Изменить</button>
                <button class="danger-action" type="button" @click="removeTemplate(template.id)">Удалить</button>
              </div>
            </article>
            <p v-if="!templates.length" class="empty-state">Сохранённых шаблонов пока нет</p>
          </div>
        </div>
      </section>
    </div>

    <div v-if="usersOpen" class="modal-backdrop" @click.self="usersOpen = false">
      <section class="management-modal users-modal" role="dialog" aria-modal="true" aria-labelledby="users-title">
        <header class="modal-header"><div><p class="eyebrow">Доступ</p><h2 id="users-title">Пользователи</h2></div><button class="icon-close" type="button" aria-label="Закрыть" @click="usersOpen = false">×</button></header>
        <div class="user-list">
          <div v-for="user in users" :key="user.id" class="user-row">
            <div><strong>{{ user.name }}</strong><span>{{ user.username }}</span></div>
            <select :value="user.role" @change="changeRole(user, ($event.target as HTMLSelectElement).value as UserRole)">
              <option value="admin">Администратор</option><option value="manager">Менеджер</option><option value="driver">Водитель</option><option value="storekeeper">Кладовщик</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
