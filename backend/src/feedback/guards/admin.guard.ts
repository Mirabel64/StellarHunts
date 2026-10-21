import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

// Guard that restricts a route (or controller) to admin users.
// Apply it with @UseGuards(AdminGuard); it expects an earlier auth step
// (e.g. a JWT guard or middleware) to have attached the user to the request
@Injectable()
export class AdminGuard implements CanActivate {
  // Logger scoped to this class name, so log lines are easy to filter
  private readonly logger = new Logger(AdminGuard.name);

  // Nest calls this before the route handler; returning true lets the request
  // through, while throwing rejects it
  canActivate(context: ExecutionContext): boolean {
    // Get the underlying HTTP request from the execution context
    const request = context.switchToHttp().getRequest();

    // Check for admin role in user object (assuming it's set by auth middleware)
    const user = request.user;
    // No user means the request was never authenticated, so reject it
    if (!user) {
      this.logger.warn('No user found in request');
      throw new UnauthorizedException('Authentication required');
    }

    // Check if user has admin role.
    // Supports both shapes: a `roles` array (user.roles = ['admin', ...])
    // and a single `role` string (user.role = 'admin')
    if (!user.roles?.includes('admin') && user.role !== 'admin') {
      // Log the attempt so suspicious access can be audited
      this.logger.warn(
        `User ${user.id} attempted to access admin endpoint without proper permissions`,
      );
      // The user is authenticated but lacks the role, so 403 Forbidden
      // (ForbiddenException) would be more accurate than 401 here
      throw new UnauthorizedException('Admin access required');
    }

    // Record successful admin access for the audit trail
    this.logger.log(`Admin access granted to user ${user.id}`);
    // Allow the request to proceed to the route handler
    return true;
  }
}
