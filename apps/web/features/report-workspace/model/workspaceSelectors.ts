import type { ReportAggregate } from '@pcr/domain';

export function findArea(aggregate: ReportAggregate | undefined, areaId: string | undefined) {
  return aggregate?.areas.find((area) => area.id === areaId);
}

export function findComponent(aggregate: ReportAggregate | undefined, areaId: string | undefined, componentId: string | undefined) {
  return findArea(aggregate, areaId)?.components.find((component) => component.id === componentId);
}

export function assessmentProgress(aggregate: ReportAggregate | undefined): { assessed: number; total: number; percent: number } {
  const components = aggregate?.areas.flatMap((area) => area.components) ?? [];
  const assessed = components.filter((component) => component.commentary.trim() && component.conditionCategory !== 'unable_to_confirm').length;
  return { assessed, total: components.length, percent: components.length ? Math.round((assessed / components.length) * 100) : 0 };
}
