import type { TargetType } from '../entities/feedback.entity';

// Payload a client sends to submit new feedback
export interface CreateFeedbackDto {
  // Numeric score given by the user (the 1-5 scale is implied by
  // FeedbackStats.ratingDistribution below)
  rating: number;
  // Optional free-text explanation
  comment?: string;
  // What kind of thing the feedback is about (e.g. app, puzzle, etc.,
  // as defined by the TargetType enum on the entity)
  targetType: TargetType;
  // Id of the specific target; optional for general feedback
  // that isn't tied to one item
  targetId?: string;
  // If true, the submitting user's identity should not be exposed
  isAnonymous?: boolean;
  // Optional client context to help with debugging and triage
  metadata?: {
    userAgent?: string; // Browser/client user agent string
    deviceInfo?: string; // Device model / OS details
    appVersion?: string; // Version of the app that sent the feedback
    [key: string]: any; // Allows any extra custom fields
  };
}

// Shape of a feedback record returned by the API
export interface FeedbackResponse {
  id: string;
  rating: number;
  comment?: string;
  targetType: TargetType;
  targetId?: string;
  // Whether the feedback was submitted anonymously
  isAnonymous: boolean;
  // Submitter's id; expected to be omitted when the feedback is anonymous
  userId?: string;
  // Client context captured at submission time (untyped here, see CreateFeedbackDto)
  metadata?: any;
  // Whether an admin has marked this feedback as handled
  isResolved: boolean;
  // Internal notes left by admins
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Aggregate statistics across feedback, typically for an admin dashboard
export interface FeedbackStats {
  // Total number of feedback entries
  totalFeedback: number;
  // Mean rating across all entries
  averageRating: number;
  // Count of entries for each possible rating value
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  // Count of entries per target type; the mapped type guarantees
  // a key for every member of the TargetType enum
  feedbackByType: {
    [key in TargetType]: number;
  };
  // How many entries were submitted anonymously
  anonymousFeedback: number;
  // How many entries have been marked resolved
  resolvedFeedback: number;
  recentFeedback: number; // last 7 days
}

// Optional criteria for narrowing down a feedback listing;
// all fields are combined, and any omitted field is not filtered on
export interface FeedbackFilters {
  // Only feedback about this kind of target
  targetType?: TargetType;
  // Only feedback with this exact rating
  rating?: number;
  // Only anonymous (true) or non-anonymous (false) feedback
  isAnonymous?: boolean;
  // Only resolved (true) or unresolved (false) feedback
  isResolved?: boolean;
  // Date range bounds on when the feedback was created
  startDate?: Date;
  endDate?: Date;
  // Only feedback from this user
  userId?: string;
  // Only feedback about this specific target
  targetId?: string;
}

// Fields an admin can change on existing feedback
export interface UpdateFeedbackDto {
  // Mark the feedback as resolved or reopen it
  isResolved?: boolean;
  // Internal notes visible to admins
  adminNotes?: string;
}
