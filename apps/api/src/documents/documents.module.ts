import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../auth/auth.service';
import { CurrentUser, JwtGuard } from '../auth/jwt.guard';
import { AiClient } from '../common/ai-client.service';
import { DocumentsService } from './documents.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.docs.list(user.workspaceId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile(new ParseFilePipeBuilder().addMaxSizeValidator({ maxSize: MAX_UPLOAD_BYTES }).build())
    file: Express.Multer.File,
  ) {
    return this.docs.upload(user.workspaceId, file);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.docs.remove(user.workspaceId, id);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, AiClient],
})
export class DocumentsModule {}
