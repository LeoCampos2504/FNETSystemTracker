import { fold } from './filters';

/** Explicit answers verified in the preventive and corrective FO templates.
 * Submission, approval, last edit, plan and end dates are not the start of the work. */
export function isFormStartQuestion(question: string) {
  const q = fold(question).replace(/^[¿¡]+\s*/, '').replace(/[?:.]+$/, '').trim();
  return /^fecha y hora de inicio de (?:las )?tareas$/.test(q)
    || /^el mantenimiento (?:correctivo|preventivo) inicia el$/.test(q)
    || /^fecha de (?:realizacion|ejecucion)(?: (?:de|del|de la|de las) (?:trabajo|tarea|tareas|mantenimiento))?$/.test(q);
}
