import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsNotEmpty()
  @IsString()
  slug: string = '';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // HH:mm formatı (00:00 – 23:59).
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Kapanış saati HH:mm formatında olmalıdır',
  })
  closingTime?: string;

  @IsOptional()
  @IsBoolean()
  debtRemindersEnabled?: boolean;
}

// Agent kurulum kodu üretimi — adapterType whitelist'i service'te DB'ye karşı doğrulanır.
export class GenerateSetupCodeDto {
  @IsNotEmpty()
  @IsString()
  adapterType: string = '';
}

// Agent'ın public bağlanma isteği.
export class ConnectAgentDto {
  @IsNotEmpty()
  @IsString()
  token: string = '';

  @IsNotEmpty()
  @IsString()
  agentVersion: string = '';
}
