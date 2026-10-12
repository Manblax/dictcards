import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTermDto {
  @ApiProperty({ example: 'ubiquitous' })
  term!: string;

  @ApiProperty({ example: 'Present, appearing, or found everywhere' })
  definition!: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  image?: string;
}

export class CreateDictcardDto {
  @ApiProperty({ example: 'Advanced English vocabulary' })
  title!: string;

  @ApiPropertyOptional({ example: 'Words from lesson 1' })
  description?: string;

  @ApiPropertyOptional({ type: () => [CreateTermDto] })
  terms?: CreateTermDto[];
}
