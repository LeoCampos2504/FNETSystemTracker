import { z } from 'zod';
const text=z.string().trim().max(200),notes=z.string().trim().max(4000),project=text.min(1),projects=z.array(project).max(100);
export const daySchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const technicians=z.array(text.min(1)).min(1).max(20),status=z.enum(['PLANIFICADO','EN_CURSO','REALIZADO','CON_PENDIENTES','CANCELADO']);
const decimal=z.string().regex(/^\d{1,15}(?:\.\d{1,3})?$/).nullable();
export const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('favorite'),name:text.min(1).max(60),projects}).strict(),
 z.object({action:z.literal('visit'),requestKey:z.string().uuid(),day:daySchema,project,siteCode:text.min(1),siteName:text,taskType:z.enum(['CORRECTIVO','PREVENTIVO','OTRO']),taskCode:text,technicians,status,outcome:notes,shift:z.enum(['LABORAL','FUERA_DE_HORARIO']).default('LABORAL')}).strict(),
 z.object({action:z.literal('updateVisit'),id:z.string().uuid(),version:z.number().int().nonnegative(),technicians,status,outcome:notes}).strict(),
 z.object({action:z.literal('close'),day:daySchema,projects}).strict(),
 z.object({action:z.literal('review'),key:z.string().min(1).max(2500),project,classification:z.enum(['PENDIENTE','INCLUIDO','NO_INCLUIDO']),intraStatus:z.enum(['PENDIENTE','PARCIAL','DESCARGADO','NO_CORRESPONDE']),invoiceNumber:text,countedQuantity:decimal,intraQuantity:decimal,notes,version:z.number().int().nonnegative(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
]);
