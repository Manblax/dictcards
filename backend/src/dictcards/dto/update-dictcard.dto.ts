import { PartialType } from '@nestjs/swagger';
import { CreateDictcardDto } from './create-dictcard.dto';

export class UpdateDictcardDto extends PartialType(CreateDictcardDto) {}
