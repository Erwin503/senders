<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Person = { id: string | number; name: string };
type UserRole = 'admin' | 'manager' | 'driver' | 'storekeeper';
type AuthUser = { id: number; username: string; name: string; role: UserRole };
type OrderTemplate = {
  id: number;
  orderType: 'income' | 'expense' | 'store';
  address: string;
  description: string | null;
  activeAt: string | null;
  usageCount: number;
};
type RouteClient = {
  id: number;
  name: string;
  districtId: number | null;
  districtName: string | null;
  districtPosition: number | null;
  circleType: string | null;
  position: number;
  comment?: string;
};
type RouteDistrict = { id: number; name: string; position: number; clients: RouteClient[] };
type RouteSheetBlock = { id: number | null; name: string; position: number; clients: RouteClient[] };
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
  stockedAt: string | null;
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
const templateEditingId = ref<number | null>(null);
const templateSearch = ref('');
const templateOrderType = ref<'income' | 'expense' | 'store'>('expense');
const templateAddress = ref('');
const templateDescription = ref('');
const templateActiveAt = ref('');
const usersOpen = ref(false);
const users = ref<AuthUser[]>([]);
const activePage = ref<'kanban' | 'routes'>('kanban');
const routeTab = ref<'sheets' | 'clients'>('sheets');
const routePaste = ref('');
const routeImportStatus = ref('');
const routeSheet = ref<RouteSheetBlock[] | null>(null);
const excludedRouteDistrictIds = ref<number[]>([]);
const visibleRouteSheet = computed(() => routeSheet.value?.filter((block) => !excludedRouteDistrictIds.value.includes(block.id ?? -1)) ?? []);
const filteredTemplates = computed(() => {
  const query = templateSearch.value.trim().toLocaleLowerCase('ru-RU');
  return templates.value.filter((template) => !query || template.address.toLocaleLowerCase('ru-RU').includes(query));
});
const routeDistricts = ref<RouteDistrict[]>([]);
const unassignedClients = ref<RouteClient[]>([]);
const newDistrictName = ref('');
const draggedDistrictId = ref<number | null>(null);
const draggedClientId = ref<number | null>(null);
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
  if (column.slug === 'stocked') tasks = tasks.filter((task) => isToday(task.stockedAt));
  if (column.slug === 'stocked') {
    return [...tasks].sort((left, right) => new Date(right.stockedAt ?? 0).getTime() - new Date(left.stockedAt ?? 0).getTime());
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

function refreshCurrentPage() {
  if (activePage.value === 'kanban') void loadBoard();
  else if (routeTab.value === 'clients') void loadRouteClients();
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
  templateSearch.value = '';
  try {
    const items = await api<OrderTemplate[]>('/templates');
    templates.value = items;
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
}

function editTemplate(template: OrderTemplate) {
  templateEditingId.value = template.id;
  templateOrderType.value = template.orderType;
  templateAddress.value = template.address;
  templateDescription.value = template.description ?? '';
  templateActiveAt.value = localDateTime(template.activeAt);
}

async function saveTemplate() {
  if (!templateAddress.value.trim()) return;
  const payload = {
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
    await api(`/templates/${template.id}/use`, { method: 'POST' });
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

async function selectMainPage(page: 'kanban' | 'routes') {
  activePage.value = page;
  if (page === 'routes' && routeTab.value === 'clients') await loadRouteClients();
}

async function selectRouteTab(tab: 'sheets' | 'clients') {
  routeTab.value = tab;
  if (tab === 'clients') await loadRouteClients();
}

function parseRoutePaste() {
  const rows = routePaste.value
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split('\t');
      return {
        name: cells.shift()?.replace(/^\uFEFF/, '').trim() ?? '',
        comment: cells.shift()?.trim() ?? '',
        circleType: cells.join('\t').trim()
      };
    })
    .filter((row) => row.name);
  const header = rows[0]?.name.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
  if (['контрагент', 'клиент', 'наименование контрагента', 'название контрагента'].includes(header ?? '')) rows.shift();
  return rows;
}

async function generateRouteSheet() {
  const entries = parseRoutePaste();
  if (!entries.length) {
    routeImportStatus.value = 'Вставьте список контрагентов';
    return;
  }
  try {
    const result = await api<{
      submittedCount: number;
      uniqueCount: number;
      duplicateCount: number;
      addedCount: number;
      existingCount: number;
      districts: RouteSheetBlock[];
    }>('/route/import', { method: 'POST', body: JSON.stringify({ entries }) });
    routeSheet.value = result.districts;
    excludedRouteDistrictIds.value = [];
    routeImportStatus.value = `Новых: ${result.addedCount} · Уже были: ${result.existingCount} · Повторов в списке: ${result.duplicateCount}`;
    await loadRouteClients();
  } catch (caught) {
    routeImportStatus.value = caught instanceof Error ? caught.message : 'Не удалось обработать список';
  }
}

function printRouteSheet() {
  window.print();
}

function toggleRouteDistrict(id: number) {
  excludedRouteDistrictIds.value = excludedRouteDistrictIds.value.includes(id)
    ? excludedRouteDistrictIds.value.filter((item) => item !== id)
    : [...excludedRouteDistrictIds.value, id];
}

async function loadRouteClients() {
  try {
    const result = await api<{ districts: RouteDistrict[]; unassigned: RouteClient[] }>('/route/clients');
    routeDistricts.value = result.districts;
    unassignedClients.value = result.unassigned;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов';
  }
}

function clientsForDistrict(districtId: number | null) {
  return districtId === null
    ? unassignedClients.value
    : routeDistricts.value.find((district) => district.id === districtId)?.clients ?? [];
}

function circleGroups(clients: RouteClient[]) {
  const groups = new Map<string, RouteClient[]>();
  for (const client of clients) {
    const name = client.circleType?.trim() || 'Вид круга не указан';
    groups.set(name, [...(groups.get(name) ?? []), client]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === 'Вид круга не указан') return 1;
      if (right === 'Вид круга не указан') return -1;
      return left.localeCompare(right, 'ru');
    })
    .map(([name, items]) => ({ name, clients: items.sort((a, b) => a.position - b.position) }));
}

async function createDistrict() {
  if (!newDistrictName.value.trim()) return;
  try {
    await api('/route/districts', { method: 'POST', body: JSON.stringify({ name: newDistrictName.value.trim() }) });
    newDistrictName.value = '';
    await loadRouteClients();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось добавить район';
  }
}

async function updateRouteClient(client: RouteClient, changes: { districtId?: number | null; circleType?: string | null }) {
  try {
    await api(`/route/clients/${client.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    await loadRouteClients();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось обновить клиента';
    await loadRouteClients();
  }
}

async function saveClientOrder(districtId: number | null, orderedIds: number[]) {
  try {
    await api('/route/clients/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ districtId, clientIds: orderedIds })
    });
    await loadRouteClients();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить порядок клиентов';
    await loadRouteClients();
  } finally {
    draggedClientId.value = null;
  }
}

function reorderedBefore<T extends { id: number }>(items: T[], movedId: number, targetId: number) {
  const next = [...items];
  const from = next.findIndex((item) => item.id === movedId);
  const to = next.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return null;
  const [moved] = next.splice(from, 1);
  next.splice(next.findIndex((item) => item.id === targetId), 0, moved);
  return next;
}

async function dropClientBefore(districtId: number | null, circleClients: RouteClient[], targetId: number) {
  if (draggedClientId.value === null || draggedClientId.value === targetId) return;
  const changedGroup = reorderedBefore(circleClients, draggedClientId.value, targetId);
  if (!changedGroup) return;
  const groupIds = new Set(circleClients.map((client) => client.id));
  let groupIndex = 0;
  const next = clientsForDistrict(districtId).map((client) => groupIds.has(client.id) ? changedGroup[groupIndex++] : client);
  await saveClientOrder(districtId, next.map((item) => item.id));
}

async function moveClientBy(districtId: number | null, circleClients: RouteClient[], clientId: number, direction: -1 | 1) {
  const index = circleClients.findIndex((client) => client.id === clientId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= circleClients.length) return;
  const nextGroup = [...circleClients];
  [nextGroup[index], nextGroup[targetIndex]] = [nextGroup[targetIndex], nextGroup[index]];
  const groupIds = new Set(circleClients.map((client) => client.id));
  let groupIndex = 0;
  const next = clientsForDistrict(districtId).map((client) => groupIds.has(client.id) ? nextGroup[groupIndex++] : client);
  await saveClientOrder(districtId, next.map((item) => item.id));
}

async function saveDistrictOrder(orderedIds: number[]) {
  try {
    await api('/route/districts/reorder', { method: 'PATCH', body: JSON.stringify({ districtIds: orderedIds }) });
    await loadRouteClients();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить порядок районов';
    await loadRouteClients();
  } finally {
    draggedDistrictId.value = null;
  }
}

async function dropDistrictBefore(targetId: number) {
  if (draggedDistrictId.value === null || draggedDistrictId.value === targetId) return;
  const next = reorderedBefore(routeDistricts.value, draggedDistrictId.value, targetId);
  if (next) await saveDistrictOrder(next.map((district) => district.id));
}

async function moveDistrictBy(districtId: number, direction: -1 | 1) {
  const index = routeDistricts.value.findIndex((district) => district.id === districtId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= routeDistricts.value.length) return;
  const next = [...routeDistricts.value];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  await saveDistrictOrder(next.map((district) => district.id));
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
        <button class="ghost-button" type="button" @click="refreshCurrentPage">Обновить</button>
        <button class="ghost-button" type="button" @click="logout">Выйти</button>
      </div>
    </header>

    <p v-if="error" class="error-note">{{ error }}</p>
    <div class="workspace-layout">
      <aside class="primary-nav" aria-label="Основные разделы">
        <button type="button" :class="{ active: activePage === 'kanban' }" @click="selectMainPage('kanban')">Канбан</button>
        <button type="button" :class="{ active: activePage === 'routes' }" @click="selectMainPage('routes')">Маршрутные листы</button>
      </aside>
      <div class="work-content">
        <template v-if="activePage === 'kanban'">
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
        </template>

        <section v-else class="routes-workspace">
          <nav class="route-tabs" role="tablist" aria-label="Маршрутные листы и клиенты">
            <button type="button" role="tab" :aria-selected="routeTab === 'sheets'" :class="{ active: routeTab === 'sheets' }" @click="selectRouteTab('sheets')">Маршрутные листы</button>
            <button type="button" role="tab" :aria-selected="routeTab === 'clients'" :class="{ active: routeTab === 'clients' }" @click="selectRouteTab('clients')">Клиенты</button>
          </nav>

          <template v-if="routeTab === 'sheets'">
            <section class="route-import">
              <textarea v-model="routePaste" class="route-paste" placeholder="Контрагент&#9;Комментарий&#9;Вид круга / заказа" aria-label="Список контрагентов, комментариев и вида круга из 1С"></textarea>
              <div class="route-import-actions">
                <button class="primary-action" type="button" @click="generateRouteSheet">Сформировать маршрутный лист</button>
                <span v-if="routeImportStatus" class="import-status">{{ routeImportStatus }}</span>
              </div>
            </section>

            <section v-if="routeSheet" class="route-sheet">
              <div class="route-page-heading">
                <button class="ghost-button" type="button" @click="printRouteSheet">Печать</button>
              </div>
              <fieldset class="route-exclusions">
                <legend>Исключить районы из печати</legend>
                <label v-for="block in routeSheet" :key="block.id ?? 'unassigned'">
                  <input type="checkbox" :checked="excludedRouteDistrictIds.includes(block.id ?? -1)" @change="toggleRouteDistrict(block.id ?? -1)" />
                  {{ block.name }}
                </label>
              </fieldset>
              <div v-for="block in visibleRouteSheet" :key="block.id ?? 'unassigned'" class="route-sheet-block">
                <h3>{{ block.name }}</h3>
                <table class="route-table" :aria-label="`Клиенты района ${block.name}`">
                  <tbody>
                    <tr v-for="client in block.clients" :key="client.id">
                      <td>{{ client.name }}</td>
                      <td>{{ client.comment || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <footer class="route-total">Всего клиентов: <strong>{{ visibleRouteSheet.reduce((count, block) => count + block.clients.length, 0) }}</strong></footer>
            </section>
          </template>

          <section v-else class="clients-workspace">
            <header class="route-page-heading clients-heading">
              <div><p class="eyebrow">Справочник</p><h2>Клиенты</h2></div>
              <form class="new-district-form" @submit.prevent="createDistrict">
                <input v-model="newDistrictName" maxlength="80" placeholder="Новый район" aria-label="Название нового района" />
                <button class="primary-action" type="submit" :disabled="!newDistrictName.trim()">Добавить район</button>
              </form>
            </header>

            <article
              v-for="district in routeDistricts"
              :key="district.id"
              class="client-district"
              @dragover.prevent
              @drop.stop="dropDistrictBefore(district.id)"
            >
              <header class="district-heading">
                <button
                  class="drag-handle district-drag-handle"
                  type="button"
                  draggable="true"
                  aria-label="Перетащить район"
                  title="Перетащить район"
                  @dragstart.stop="draggedDistrictId = district.id"
                  @dragend="draggedDistrictId = null"
                >⠿</button>
                <h3>{{ district.name }}</h3>
                <span class="district-count">{{ district.clients.length }}</span>
                <div class="client-order-buttons district-order-buttons">
                  <button type="button" :disabled="district.position === 0" aria-label="Район выше" @click="moveDistrictBy(district.id, -1)">↑</button>
                  <button type="button" :disabled="district.position === routeDistricts.length - 1" aria-label="Район ниже" @click="moveDistrictBy(district.id, 1)">↓</button>
                </div>
              </header>
              <div v-for="group in circleGroups(district.clients)" :key="group.name" class="circle-group">
                <h4>{{ group.name }}</h4>
                <div class="client-list">
                  <div
                    v-for="(client, clientIndex) in group.clients"
                    :key="client.id"
                    class="route-client-row"
                    @dragover.prevent
                    @drop.stop="dropClientBefore(district.id, group.clients, client.id)"
                  >
                    <button class="drag-handle client-drag-handle" type="button" draggable="true" :aria-label="`Перетащить ${client.name}`" title="Перетащить клиента" @dragstart.stop="draggedClientId = client.id" @dragend="draggedClientId = null">⠿</button>
                    <div class="client-name"><strong>{{ client.name }}</strong></div>
                    <select :value="client.districtId ?? ''" aria-label="Район клиента" @change="updateRouteClient(client, { districtId: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null })">
                      <option value="">Без района</option>
                      <option v-for="item in routeDistricts" :key="item.id" :value="item.id">{{ item.name }}</option>
                    </select>
                    <input :value="client.circleType ?? ''" maxlength="80" placeholder="Вид круга" aria-label="Вид круга клиента" @change="updateRouteClient(client, { circleType: ($event.target as HTMLInputElement).value.trim() || null })" />
                    <div class="client-order-buttons">
                      <button type="button" :disabled="clientIndex === 0" aria-label="Выше" @click="moveClientBy(district.id, group.clients, client.id, -1)">↑</button>
                      <button type="button" :disabled="clientIndex === group.clients.length - 1" aria-label="Ниже" @click="moveClientBy(district.id, group.clients, client.id, 1)">↓</button>
                    </div>
                  </div>
                </div>
              </div>
              <p v-if="!district.clients.length" class="empty-state">В районе пока нет клиентов</p>
            </article>

            <article v-if="unassignedClients.length" class="client-district unassigned-district">
              <header class="district-heading"><h3>Без района</h3><span class="district-count">{{ unassignedClients.length }}</span></header>
              <div v-for="group in circleGroups(unassignedClients)" :key="group.name" class="circle-group">
                <h4>{{ group.name }}</h4>
                <div class="client-list">
                  <div v-for="(client, clientIndex) in group.clients" :key="client.id" class="route-client-row" @dragover.prevent @drop.stop="dropClientBefore(null, group.clients, client.id)">
                    <button class="drag-handle client-drag-handle" type="button" draggable="true" :aria-label="`Перетащить ${client.name}`" title="Перетащить клиента" @dragstart.stop="draggedClientId = client.id" @dragend="draggedClientId = null">⠿</button>
                    <div class="client-name"><strong>{{ client.name }}</strong></div>
                    <select :value="client.districtId ?? ''" aria-label="Район клиента" @change="updateRouteClient(client, { districtId: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null })"><option value="">Без района</option><option v-for="item in routeDistricts" :key="item.id" :value="item.id">{{ item.name }}</option></select>
                    <input :value="client.circleType ?? ''" maxlength="80" placeholder="Вид круга" aria-label="Вид круга клиента" @change="updateRouteClient(client, { circleType: ($event.target as HTMLInputElement).value.trim() || null })" />
                    <div class="client-order-buttons"><button type="button" :disabled="clientIndex === 0" aria-label="Выше" @click="moveClientBy(null, group.clients, client.id, -1)">↑</button><button type="button" :disabled="clientIndex === group.clients.length - 1" aria-label="Ниже" @click="moveClientBy(null, group.clients, client.id, 1)">↓</button></div>
                  </div>
                </div>
              </div>
            </article>
            <p v-if="!routeDistricts.length && !unassignedClients.length" class="empty-state">Клиентов пока нет</p>
          </section>
        </section>
      </div>
    </div>

    <div v-if="templatesOpen" class="modal-backdrop" @click.self="templatesOpen = false">
      <section class="management-modal" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <header class="modal-header">
          <div><p class="eyebrow">Заказы</p><h2 id="templates-title">Шаблоны</h2></div>
          <button class="icon-close" type="button" aria-label="Закрыть" @click="templatesOpen = false">×</button>
        </header>
        <div class="template-layout">
          <form class="template-form" @submit.prevent="saveTemplate">
            <h3>{{ templateEditingId ? 'Изменить шаблон' : 'Новый шаблон' }}</h3>
            <label class="form-field"><span>Вид заказа</span><select v-model="templateOrderType"><option value="expense">Расход</option><option value="income">Приход</option><option value="store">На магазин</option></select></label>
            <label class="form-field"><span>Клиент</span><input v-model="templateAddress" maxlength="160" required /></label>
            <label class="form-field"><span>Комментарий</span><textarea v-model="templateDescription" maxlength="1000" rows="3"></textarea></label>
            <label class="form-field"><span>Активировать с</span><input v-model="templateActiveAt" type="datetime-local" /></label>
            <div class="card-actions">
              <button class="primary-action" type="submit">{{ templateEditingId ? 'Сохранить' : 'Добавить' }}</button>
              <button v-if="templateEditingId" class="ghost-action" type="button" @click="resetTemplateForm">Отмена</button>
            </div>
          </form>
          <div class="template-list">
            <input v-model="templateSearch" class="template-search" type="search" placeholder="Найти клиента" aria-label="Поиск шаблона по названию клиента" />
            <article v-for="template in filteredTemplates" :key="template.id" class="template-row">
              <div class="template-main">
                <span class="template-kind">{{ { expense: 'Расход', income: 'Приход', store: 'На магазин' }[template.orderType] }} · Использовали: {{ template.usageCount }}</span>
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
            <p v-if="!filteredTemplates.length" class="empty-state">{{ templates.length ? 'По этому запросу ничего не найдено' : 'Сохранённых шаблонов пока нет' }}</p>
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
