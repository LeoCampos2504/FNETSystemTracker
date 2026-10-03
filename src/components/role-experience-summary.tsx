"use client";

import { BriefcaseBusiness, Database, MapPinned, ShieldCheck, Truck, Users } from "lucide-react";
import type { UserRole } from "@/contracts";
import { UserRole as UserRoleValues } from "@/contracts";
import { mockAssets, mockScopeForRole, mockTasks } from "@/mocks";
import { filterTasksForScope, scopeAllowsResource } from "@/lib/scope";

const roleCopy: Record<UserRole, { eyebrow: string; title: string; detail: string }> = {
  TECHNICIAN: { eyebrow: "Experiencia propia", title: "Mi operación", detail: "Solo tareas, activos y cobertura vinculados a tu alcance." },
  COORDINATOR: { eyebrow: "Experiencia de coordinación", title: "Mis zonas", detail: "Profundidad operativa para planificar y resolver." },
  MANAGER: { eyebrow: "Experiencia gerencial", title: "Consolidado regional", detail: "Indicadores agregados sin perder el alcance organizacional." },
  ADMIN: { eyebrow: "Experiencia administrativa", title: "Vista global", detail: "Cobertura completa del modelo nacional y sus fuentes." },
};

export function RoleExperienceSummary({ role }: { role: UserRole }) {
  const scope = mockScopeForRole(role);
  const tasks = filterTasksForScope(mockTasks, scope);
  const assets = mockAssets.filter((asset) => scopeAllowsResource(scope, asset));
  const isTechnician = role === UserRoleValues.TECHNICIAN;
  const icon = role === UserRoleValues.TECHNICIAN ? Truck : role === UserRoleValues.COORDINATOR ? MapPinned : role === UserRoleValues.MANAGER ? BriefcaseBusiness : ShieldCheck;
  const Icon = icon;
  return <section className="panel role-experience-panel" aria-label={`Experiencia de ${role.toLowerCase()}`}>
    <div className="role-experience-heading"><div><p className="eyebrow">{roleCopy[role].eyebrow}</p><h2><Icon size={19} /> {roleCopy[role].title}</h2><p>{roleCopy[role].detail}</p></div><span className="source-footnote"><Database size={14} /> Contratos locales · modo demo explícito</span></div>
    <div className="role-experience-grid">
      <div><span className="kpi-label">Tareas en alcance</span><strong>{tasks.length}</strong><small>{isTechnician ? "asignadas a mí" : "sin filtrar en cliente"}</small></div>
      <div><span className="kpi-label">Activos relacionados</span><strong>{assets.length}</strong><small>Oppen · lectura</small></div>
      <div><span className="kpi-label">Scope</span><strong>{role === UserRoleValues.ADMIN ? "Global" : `${scope.zoneIds.length} zonas`}</strong><small>enforced por adapter</small></div>
      <div><span className="kpi-label">Fuentes</span><strong>{role === UserRoleValues.TECHNICIAN ? "Propias" : "Consolidado"}</strong><small><Users size={12} /> alcance vigente</small></div>
    </div>
  </section>;
}
