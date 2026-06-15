import { IsOptional, IsUUID } from 'class-validator';

export class SyncStatusQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
