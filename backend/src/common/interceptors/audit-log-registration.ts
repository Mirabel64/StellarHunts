export interface AuditLogEntry {
  adminId: string;
  action: string;
  resource: string;
  timestamp: number;
}

export class AuditLogRegistrationService {
  private logs: AuditLogEntry[] = [];

  public logAction(adminId: string, action: string, resource: string): AuditLogEntry {
    const entry: AuditLogEntry = {
      adminId,
      action,
      resource,
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    return entry;
  }

  public getAuditLogs(): AuditLogEntry[] {
    return [...this.logs];
  }
}
