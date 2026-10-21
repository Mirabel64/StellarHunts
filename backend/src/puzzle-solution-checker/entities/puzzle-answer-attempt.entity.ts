import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PuzzleCheckOutcome {
  CORRECT = 'correct',
  INCORRECT = 'incorrect',
  RATE_LIMITED = 'rate_limited',
  NOT_FOUND = 'not_found',
}

@Entity('puzzle_answer_attempts')
@Index(['playerId', 'puzzleId', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
export class PuzzleAnswerAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  puzzleId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  playerId: string | null;

  @Column({ type: 'varchar', length: 64 })
  answerHash: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ type: 'enum', enum: PuzzleCheckOutcome })
  outcome: PuzzleCheckOutcome;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
