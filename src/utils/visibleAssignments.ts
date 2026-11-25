export function visibleAssignments<T extends { id: string; date: string; staffIds: string[] }>(assignments: T[], attendance: { assignmentId: string; staffId: string; checkInTime?: string | null; checkOutTime?: string | null }[], userId: string, today: string): T[] {
  return assignments.filter(a => a.staffIds.includes(userId) && (a.date === today || (a.date < today && attendance.some(r => r.assignmentId === a.id && r.staffId === userId && r.checkInTime && !r.checkOutTime))));
}
