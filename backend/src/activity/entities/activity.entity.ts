import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

// The kinds of events that can be recorded in the activity history.
// Stored as a Postgres enum, so adding a value requires a migration
export enum ActivityType {
  LOGIN = 'LOGIN', // User signed in
  PUZZLE_ATTEMPT = 'PUZZLE_ATTEMPT', // User attempted a puzzle
  NFT_MINT = 'NFT_MINT', // User minted an NFT
}

// Maps this class to an "activity" table in the database
@Entity()
export class Activity {
  // Auto-generated UUID primary key
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Many activities belong to one user. This creates a userId foreign key
  // column (which is what the service queries with activity.userId).
  // onDelete: 'CASCADE' removes a user's activities when the user is deleted
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  // What kind of event this is, restricted to the ActivityType enum values
  @Column({ type: 'enum', enum: ActivityType })
  type: ActivityType;

  // Free-form extra details about the event (e.g. puzzle id, token id).
  // jsonb allows flexible structure and can be indexed/queried in Postgres.
  // Nullable because not every activity needs extra data
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Timestamp set automatically when the row is inserted;
  // used for ordering and date-range filtering
  @CreateDateColumn()
  createdAt: Date;
}