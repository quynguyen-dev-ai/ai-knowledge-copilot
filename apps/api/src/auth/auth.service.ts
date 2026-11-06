import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

export interface JwtPayload {
  sub: string;
  workspaceId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 12),
        workspace: { create: {} },
      },
      include: { workspace: true },
    });
    return this.issueToken(user.id, user.workspace!.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { workspace: true },
    });
    // Same error for unknown email and wrong password: don't leak which accounts exist.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user.id, user.workspace!.id);
  }

  private issueToken(userId: string, workspaceId: string) {
    const payload: JwtPayload = { sub: userId, workspaceId };
    return { accessToken: this.jwt.sign(payload) };
  }
}
