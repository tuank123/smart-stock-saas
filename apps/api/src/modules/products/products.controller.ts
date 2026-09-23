import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateProductDto,
  PatchUnitsPerCaseDto,
  ProductQueryDto,
  ProductSuggestQueryDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createProduct(dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO)
  @Get()
  list(
    @Query() query: ProductQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listProducts(query, user);
  }

  // Statik route `:id`'den ÖNCE tanımlanır — aksi hâlde 'suggest' segmenti
  // `:id`'ye düşer ve ParseUUIDPipe 400 verir.
  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO)
  @Get('suggest')
  suggest(
    @Query() query: ProductSuggestQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.suggestProducts(query, user);
  }

  // Kardeş route `@Get()` ile AYNI rol kısıtı — ikisi de aynı ürün verisini
  // döndürdüğü için yetkilendirmeleri de aynı olmalı (eskiden bu route'ta
  // hiç @Roles yoktu; RolesGuard @Roles yoksa kontrolü ATLIYOR, yani rolü
  // ne olursa olsun her kimliği doğrulanmış kullanıcı erişebiliyordu).
  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO)
  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getProduct(id, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Patch(':productId/units-per-case')
  updateUnitsPerCase(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: PatchUnitsPerCaseDto,
    @CurrentUser()
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    return this.service.updateUnitsPerCase(productId, dto, user);
  }
}
