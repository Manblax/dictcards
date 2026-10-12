import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CreateDictcardDto } from './dto/create-dictcard.dto';
import { UpdateDictcardDto } from './dto/update-dictcard.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';

@Injectable()
export class DictcardsService {
  constructor(private prisma: PrismaService) {}

  private moduleAccessWhere(user: JwtUser, id?: string): Prisma.ModuleWhereInput {
    return {
      ...(id ? { id } : {}),
      OR: [
        { userId: user.userId },
        { userId: null, author: user.username },
      ],
    };
  }

  create(user: JwtUser, createDictcardDto: CreateDictcardDto) {
    return this.prisma.module.create({
      data: {
        title: createDictcardDto.title,
        description: createDictcardDto.description,
        author: user.username,
        termCount: createDictcardDto.terms?.length || 0,
        userId: user.userId,
        terms: {
          create: createDictcardDto.terms?.map((term, position) => ({
            term: term.term,
            definition: term.definition,
            image: term.image,
            position,
          })),
        },
      },
      include: {
        terms: {
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  findAll(user: JwtUser, skip?: number, take?: number) {
    return this.prisma.module.findMany({
      where: this.moduleAccessWhere(user),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: JwtUser, id: string) {
    const module = await this.prisma.module.findFirst({
      where: this.moduleAccessWhere(user, id),
      include: {
        terms: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!module) {
      throw new NotFoundException('Module not found');
    }

    return module;
  }

  async update(user: JwtUser, id: string, updateDictcardDto: UpdateDictcardDto) {
    const { terms, title, description } = updateDictcardDto;

    return this.prisma.$transaction(async (tx) => {
      const existingModule = await tx.module.findFirst({
        where: this.moduleAccessWhere(user, id),
        select: { id: true },
      });

      if (!existingModule) {
        throw new NotFoundException('Module not found');
      }

      const updatedModule = await tx.module.update({
        where: { id: existingModule.id },
        data: {
          title,
          description,
          termCount: terms ? terms.length : undefined,
        },
      });

      if (terms) {
        await tx.term.deleteMany({
          where: { moduleId: existingModule.id },
        });

        if (terms.length > 0) {
          await tx.term.createMany({
            data: terms.map((term, position) => ({
              term: term.term,
              definition: term.definition,
              image: term.image,
              moduleId: existingModule.id,
              position,
            })),
          });
        }
      }

      return updatedModule;
    });
  }

  async remove(user: JwtUser, id: string) {
    const existingModule = await this.prisma.module.findFirst({
      where: this.moduleAccessWhere(user, id),
      select: { id: true },
    });

    if (!existingModule) {
      throw new NotFoundException('Module not found');
    }

    return this.prisma.module.delete({
      where: { id: existingModule.id },
    });
  }
}
