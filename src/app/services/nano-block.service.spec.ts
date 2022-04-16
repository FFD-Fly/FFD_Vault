import { TestBed, inject } from '@angular/core/testing';

import { NanoBlockService } from './nano-block.service';

describe('NanoBlockService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NanoBlockService]
    });
  });

  it('应该创建', inject([NanoBlockService], (service: NanoBlockService) => {
    expect(service).toBeTruthy();
  }));
});
