import { Test, TestingModule } from '@nestjs/testing';
import { DictcardsService } from './dictcards.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';

describe('DictcardsService', () => {
  let service: DictcardsService;
  let prisma: {
    module: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };

  const user: JwtUser = {
    userId: 'user-1',
    username: 'alice',
  };

  beforeEach(async () => {
    prisma = {
      module: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DictcardsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DictcardsService>(DictcardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('scopes module lists to the authenticated user', async () => {
    prisma.module.findMany.mockResolvedValue([]);

    await service.findAll(user, 0, 20);

    expect(prisma.module.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'user-1' },
          { userId: null, author: 'alice' },
        ],
      },
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('stores the authenticated user as the module owner on create', async () => {
    prisma.module.create.mockResolvedValue({});

    await service.create(user, {
      title: 'Spanish',
      description: 'Basics',
      terms: [
        { term: 'hola', definition: 'hello' },
        { term: 'adios', definition: 'bye' },
      ],
    });

    expect(prisma.module.create).toHaveBeenCalledWith({
      data: {
        title: 'Spanish',
        description: 'Basics',
        author: 'alice',
        termCount: 2,
        userId: 'user-1',
        terms: {
          create: [
            {
              term: 'hola',
              definition: 'hello',
              image: undefined,
              position: 0,
            },
            {
              term: 'adios',
              definition: 'bye',
              image: undefined,
              position: 1,
            },
          ],
        },
      },
      include: {
        terms: {
          orderBy: { position: 'asc' },
        },
      },
    });
  });

  it('returns terms in their saved position order', async () => {
    prisma.module.findFirst.mockResolvedValue({ id: 'module-1', terms: [] });

    await service.findOne(user, 'module-1');

    expect(prisma.module.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'module-1',
        OR: [
          { userId: 'user-1' },
          { userId: null, author: 'alice' },
        ],
      },
      include: {
        terms: {
          orderBy: { position: 'asc' },
        },
      },
    });
  });
});
