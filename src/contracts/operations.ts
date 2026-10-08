export type VisitStatus = 'PLANIFICADO' | 'EN_CURSO' | 'REALIZADO' | 'CON_PENDIENTES' | 'CANCELADO';
export type VisitShift = 'LABORAL' | 'FUERA_DE_HORARIO';
export type Visit = { shift?:VisitShift; id:string; day:string; project:string; siteCode:string; siteName:string; taskType:string; taskCode:string; technicians:string[]; status:VisitStatus; outcome:string; version:number; updatedAt:string; pending:string[]; closed:boolean };
export type SourceMaterial = { key:string; formulario:string; group:string; index:string; description:string; quantity:string|null; siteCode:string; siteName:string; technician:string; image:string|null; imageDeclared:boolean; projects:string[]; source:string; syncedAt:string; hash:string; formStatus?:string; editedAt?:string|null; provider?:string; link?:string|null; /** Sub-zone of the form's task in Sytex ("Sub project"); not part of the review hash. */ subZone?:string|null };
export type MaterialReview = { project:string; classification:string; intraStatus:string; invoiceNumber:string; countedQuantity:string|null; intraQuantity:string|null; notes:string; version:number; sourceHash:string; updatedAt:string; updatedBy:string };
export type Material = SourceMaterial & { review:MaterialReview|null; files:{id:string;fileName:string;mimeType:string}[]; changed:boolean; missing:boolean; difference:number|null };
export type Favorite = { name:string; projects:string[] };
export type OperationsCatalog = { projects:string[]; allProjects:string[]; favorites:Favorite[]; admin:boolean; tasks:{code:string;type:string;project:string;siteCode:string;siteName:string;description:string;technicians:string[];status?:string;planDate?:string|null}[]; technicians:string[] };
export type SiteMaintenance = { kind:'SERVICE_GE'|'FILTROS_AA'; lastDate:string; dueDate:string; due:boolean; formCode:string };
export type GuardPeriod = { id:string; technician:string; from:string; to:string };
export type Holiday = { day:string; name:string };
export type OffHoursVisit = { id:string; day:string; project:string; siteCode:string; siteName:string; taskCode:string; technicians:string[]; status:VisitStatus; outcome:string; hours:number|null };
export type GuardOverview = { ctic:boolean; from:string; to:string; periods:GuardPeriod[]; holidays:Holiday[]; offHours:OffHoursVisit[]; technicians:string[] };
export type SiteContext = { maintenance:SiteMaintenance[]; forms:OperationsCatalog['tasks']; pending:string[]; previous:{day:string;project:string;taskType:string;status:VisitStatus;outcome:string}[] };

/** Site control: generator service, air conditioner filters and fuel loads of every site, read from Sytex. */
export type SiteAnswer = { question:string; answer:string };
export type SiteFuelLoad = { id:string; formCode:string; siteCode:string; siteName:string; project:string; date:string|null; liters:number|null; fuel:string|null; levelBefore:string|null; levelAfter:string|null; hourmeter:string|null; origin:string; source:'Sytex'|'n8n'; link:string|null };
export type SiteServiceReport = { formCode:string; siteCode:string; siteName:string; project:string; date:string|null; serviceDone:boolean; oilLiters:number|null; waterLiters:number|null; coolantLiters:number|null; filters:string[]; hourmeter:string|null; link:string|null; answers:SiteAnswer[] };
export type SiteControlRow = { siteCode:string; siteName:string; project:string; service:SiteMaintenance|null; airFilters:SiteMaintenance|null; lastService:SiteServiceReport|null; lastFuel:SiteFuelLoad|null };
export type SiteControl = { sites:SiteControlRow[]; fuel:SiteFuelLoad[]; services:SiteServiceReport[] };
