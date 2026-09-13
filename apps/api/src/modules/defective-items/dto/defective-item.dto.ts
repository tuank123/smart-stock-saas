import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateDefectiveItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number = 0;

  @IsString()
  @IsNotEmpty()
  photoBase64: string = '';
}
