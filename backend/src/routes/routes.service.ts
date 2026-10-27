import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import type { CreateDistrictDto, ImportRouteListDto, ReorderDistrictsDto, ReorderRouteClientsDto, UpdateRouteClientDto } from './routes.dto';

type DistrictRow = { id: number; name: string; name_key?: string; position: number };
type ClientRow = {
  id: number;
  name: string;
  district_id: number | null;
  district_name?: string | null;
  district_position?: number | null;
  circle_type: string | null;
  order_type: string | null;
  position: number;
};

@Injectable()
export class RoutesService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async importList(dto: ImportRouteListDto) {
    const uniqueEntries = new Map<string, { name: string; comment: string; orderType: string }>();
    for (const entry of dto.entries) {
      const name = entry.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = this.nameKey(name);
      const comment = entry.comment?.trim() ?? '';
      const orderType = entry.orderType?.trim() ?? '';
      const current = uniqueEntries.get(key);
      if (!current) {
        uniqueEntries.set(key, { name, comment, orderType });
      } else if (comment && !current.comment.split('\n').includes(comment)) {
        current.comment = current.comment ? `${current.comment}\n${comment}` : comment;
        if (orderType) current.orderType = orderType;
      } else if (orderType) {
        current.orderType = orderType;
      }
    }

    const newlyCreated = await this.db.transaction(async (trx) => {
      const maxPositionRow = await trx('route_clients').whereNull('district_id').max<{ max: number | null }>('position as max').first();
      let nextPosition = (maxPositionRow?.max ?? -1) + 1;
      let created = 0;
      for (const [nameKey, entry] of uniqueEntries) {
        const exists = await trx('route_clients').where({ name_key: nameKey }).first('id');
        if (exists) {
          if (entry.orderType) await trx('route_clients').where({ id: exists.id }).update({ order_type: entry.orderType, updated_at: trx.fn.now() });
          continue;
        }
        try {
          await trx('route_clients').insert({
            name: entry.name,
            name_key: nameKey,
            district_id: null,
            circle_type: null,
            order_type: entry.orderType || null,
            position: nextPosition++
          });
          created += 1;
        } catch (error) {
          if (!this.isDuplicateKey(error)) throw error;
        }
      }
      return created;
    });

    const keys = [...uniqueEntries.keys()];
    const clients = keys.length
      ? await this.db<ClientRow>('route_clients')
          .leftJoin('route_districts', 'route_clients.district_id', 'route_districts.id')
          .whereIn('route_clients.name_key', keys)
          .select('route_clients.*', 'route_districts.name as district_name', 'route_districts.position as district_position')
      : [];
    const clientByKey = new Map(clients.map((client) => [this.nameKey(client.name), client]));
    const responseEntries = [...uniqueEntries].map(([key, entry]) => {
      const client = clientByKey.get(key);
      if (!client) throw new NotFoundException(`Не удалось сохранить контрагента ${entry.name}`);
      return { ...this.serializeClient(client), comment: entry.comment, orderType: entry.orderType || client.orderType };
    });
    responseEntries.sort((left, right) =>
      (left.districtPosition ?? Number.MAX_SAFE_INTEGER) - (right.districtPosition ?? Number.MAX_SAFE_INTEGER)
      || left.position - right.position
      || left.name.localeCompare(right.name, 'ru')
    );

    const groups = new Map<string, { id: number | null; name: string; position: number; clients: typeof responseEntries }>();
    for (const client of responseEntries) {
      const groupKey = client.districtId === null ? 'unassigned' : String(client.districtId);
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          id: client.districtId,
          name: client.districtName ?? 'Без района',
          position: client.districtPosition ?? Number.MAX_SAFE_INTEGER,
          clients: []
        };
        groups.set(groupKey, group);
      }
      group.clients.push(client);
    }
    return {
      submittedCount: dto.entries.filter((entry) => entry.name.trim()).length,
      uniqueCount: uniqueEntries.size,
      duplicateCount: dto.entries.filter((entry) => entry.name.trim()).length - uniqueEntries.size,
      addedCount: newlyCreated,
      existingCount: uniqueEntries.size - newlyCreated,
      districts: [...groups.values()].sort((left, right) => left.position - right.position)
    };
  }

  async list() {
    const [districtRows, clientRows] = await Promise.all([
      this.db<DistrictRow>('route_districts').select('*').orderBy('position'),
      this.db<ClientRow>('route_clients')
        .leftJoin('route_districts', 'route_clients.district_id', 'route_districts.id')
        .select('route_clients.*', 'route_districts.name as district_name', 'route_districts.position as district_position')
        .orderByRaw('COALESCE(route_districts.position, 2147483647) asc')
        .orderBy('route_clients.position', 'asc')
        .orderBy('route_clients.name', 'asc')
    ]);
    const districts = districtRows.map((district) => ({
      id: district.id,
      name: district.name,
      position: district.position,
      clients: clientRows.filter((client) => client.district_id === district.id).map((client) => this.serializeClient(client))
    }));
    return {
      districts,
      unassigned: clientRows.filter((client) => client.district_id === null).map((client) => this.serializeClient(client))
    };
  }

  async createDistrict(dto: CreateDistrictDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Укажите название района');
    const nameKey = this.nameKey(name);
    const existing = await this.db<DistrictRow>('route_districts').where({ name_key: nameKey }).first();
    if (existing) throw new ConflictException('Такой район уже существует');
    const maxPositionRow = await this.db<DistrictRow>('route_districts').max<{ max: number | null }>('position as max').first();
    const [id] = await this.db<DistrictRow>('route_districts').insert({
      name,
      name_key: nameKey,
      position: (maxPositionRow?.max ?? -1) + 1
    });
    return this.db<DistrictRow>('route_districts').where({ id }).first();
  }

  async updateClient(id: number, dto: UpdateRouteClientDto) {
    const current = await this.db('route_clients').where({ id }).first();
    if (!current) throw new NotFoundException('Клиент не найден');
    const hasDistrict = dto.districtId !== undefined;
    const nextDistrictId = hasDistrict ? dto.districtId ?? null : current.district_id;
    if (nextDistrictId !== null && !await this.db('route_districts').where({ id: nextDistrictId }).first()) {
      throw new NotFoundException('Район не найден');
    }
    const districtChanged = nextDistrictId !== current.district_id;
    let position = current.position;
    if (districtChanged) {
      const maxPositionRow = await this.db('route_clients').modify((query) => {
        if (nextDistrictId === null) query.whereNull('district_id');
        else query.where({ district_id: nextDistrictId });
      }).max<{ max: number | null }>('position as max').first();
      position = (maxPositionRow?.max ?? -1) + 1;
    }
    const update: Record<string, unknown> = {
      district_id: nextDistrictId,
      position,
      updated_at: this.db.fn.now()
    };
    if (dto.circleType !== undefined) update.circle_type = dto.circleType?.trim() || null;
    if (dto.orderType !== undefined) update.order_type = dto.orderType?.trim() || null;
    await this.db('route_clients').where({ id }).update(update);
    return { ok: true };
  }

  async reorderDistricts(dto: ReorderDistrictsDto) {
    await this.db.transaction(async (trx) => {
      const current = await trx<DistrictRow>('route_districts').select('id').orderBy('position');
      this.ensureSameIds(current.map((item) => item.id), dto.districtIds, 'Список районов изменился');
      await Promise.all(dto.districtIds.map((id, position) =>
        trx('route_districts').where({ id }).update({ position })
      ));
    });
    return { ok: true };
  }

  async reorderClients(dto: ReorderRouteClientsDto) {
    const districtId = dto.districtId ?? null;
    await this.db.transaction(async (trx) => {
      const query = trx('route_clients').select('id');
      if (districtId === null) query.whereNull('district_id');
      else query.where({ district_id: districtId });
      const current = await query.orderBy('position') as Array<{ id: number }>;
      this.ensureSameIds(current.map((item) => item.id), dto.clientIds, 'Список клиентов изменился');
      await Promise.all(dto.clientIds.map((id, position) =>
        trx('route_clients').where({ id }).update({ position, updated_at: trx.fn.now() })
      ));
    });
    return { ok: true };
  }

  private nameKey(name: string) {
    return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
  }

  private serializeClient(client: ClientRow) {
    return {
      id: client.id,
      name: client.name,
      districtId: client.district_id,
      districtName: client.district_name ?? null,
      districtPosition: client.district_position ?? null,
      circleType: client.circle_type,
      orderType: client.order_type ?? null,
      position: client.position
    };
  }

  private ensureSameIds(existing: number[], requested: number[], message: string) {
    const current = new Set(existing);
    if (requested.length !== current.size || new Set(requested).size !== requested.length || requested.some((id) => !current.has(id))) {
      throw new BadRequestException(message);
    }
  }

  private isDuplicateKey(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ER_DUP_ENTRY';
  }
}
