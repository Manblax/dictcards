import { Test, TestingModule } from '@nestjs/testing';
import { DictcardsController } from './dictcards.controller';
import { DictcardsService } from './dictcards.service';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';

describe('DictcardsController', () => {
  let controller: DictcardsController;
  let dictcardsService: {
    findAll: jest.Mock;
  };

  const user: JwtUser = {
    userId: 'user-1',
    username: 'alice',
  };

  beforeEach(async () => {
    dictcardsService = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DictcardsController],
      providers: [
        {
          provide: DictcardsService,
          useValue: dictcardsService,
        },
      ],
    }).compile();

    controller = module.get<DictcardsController>(DictcardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the authenticated user into list queries', async () => {
    dictcardsService.findAll.mockResolvedValue([]);

    await controller.findAll(user, '10', '5');

    expect(dictcardsService.findAll).toHaveBeenCalledWith(user, 10, 5);
  });
});
