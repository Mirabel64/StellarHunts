import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a report', () => {
    const dto = {} as CreateReportDto;
    expect(service.create(dto)).toBe('This action adds a new report');
  });

  it('should return all reports', () => {
    expect(service.findAll()).toContain('all reports');
  });

  it('should return one report by id', () => {
    expect(service.findOne(1)).toBe('This action returns a #1 report');
  });

  it('should update a report', () => {
    const dto = {} as UpdateReportDto;
    expect(service.update(2, dto)).toBe('This action updates a #2 report');
  });

  it('should remove a report', () => {
    expect(service.remove(3)).toBe('This action removes a #3 report');
  });
});
