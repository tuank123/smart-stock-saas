import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
