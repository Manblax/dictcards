import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DictcardsService } from './dictcards.service';
import { CreateDictcardDto } from './dto/create-dictcard.dto';
import { UpdateDictcardDto } from './dto/update-dictcard.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';

@ApiTags('Dictcards')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dictcards')
export class DictcardsController {
  constructor(private readonly dictcardsService: DictcardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a dictcard module' })
  @ApiResponse({ status: 201, description: 'Module created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(
    @CurrentUser() user: JwtUser,
    @Body() createDictcardDto: CreateDictcardDto,
  ) {
    return this.dictcardsService.create(user, createDictcardDto);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's dictcard modules" })
  @ApiQuery({ name: 'skip', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, minimum: 1 })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.dictcardsService.findAll(
      user,
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a dictcard module' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.dictcardsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dictcard module' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() updateDictcardDto: UpdateDictcardDto,
  ) {
    return this.dictcardsService.update(user, id, updateDictcardDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dictcard module' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.dictcardsService.remove(user, id);
  }
}
