import { Test, TestingModule } from '@nestjs/testing';
import { LockController } from './lock.controller';

describe('LockController', () => {
  let controller: LockController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LockController],
    }).compile();

    controller = module.get<LockController>(LockController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
