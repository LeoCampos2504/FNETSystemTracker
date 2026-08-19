export interface TechnicianKpis {
  technicianId: string;
  /** ISO date range this snapshot covers, e.g. a month. */
  periodStart: string;
  periodEnd: string;

  completedTasks: number;
  completedPreventive: number;
  completedCorrective: number;
  pendingTasks: number;

  /** completed scheduled tasks / scheduled tasks * 100 */
  complianceRate: number;
  /** completed scheduled preventive tasks / scheduled preventive tasks * 100 */
  preventiveComplianceRate: number;

  /** Count of rejection events (a resubmitted-then-rejected form counts each time). */
  rejections: number;
  averageTaskDurationMinutes: number;
  dailyProductivity: number;
  ranking: number;

  guardCorrectivesCompleted: number;
  guardUrgentCount: number;
  averageTimeInTaskMinutes: number;
  tasksPerDay: number;
}

export interface TechnicianRankingEntry {
  technicianId: string;
  rank: number;
  completedTasks: number;
  complianceRate: number;
}
