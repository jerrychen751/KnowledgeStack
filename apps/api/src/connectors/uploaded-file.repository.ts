import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

/** Every query against `uploaded_files`, the store an upload source serves its documents from. */
@Injectable()
export class UploadedFileRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of the uploaded files of this workspace, by file name. `afterFileName` skips every name up to and including it. */
  async listUploadedFiles(
    workspaceId: string,
    afterFileName: string | undefined,
    take: number,
  ): Promise<{ fileName: string; updatedAt: Date }[]> {
    return this.prisma.uploadedFile.findMany({
      where: {
        workspaceId,
        ...(afterFileName === undefined ? {} : { fileName: { gt: afterFileName } }),
      },
      orderBy: { fileName: "asc" },
      take,
      select: { fileName: true, updatedAt: true },
    });
  }

  /** Return the text of one uploaded file with the time it last changed, or null when the workspace holds no such name. */
  async findUploadedFile(
    workspaceId: string,
    fileName: string,
  ): Promise<{ text: string; updatedAt: Date } | null> {
    return this.prisma.uploadedFile.findUnique({
      where: { workspaceId_fileName: { workspaceId, fileName } },
      select: { text: true, updatedAt: true },
    });
  }

  async checkUploadedFileExists(workspaceId: string, fileName: string): Promise<boolean> {
    const uploadedFile = await this.prisma.uploadedFile.findUnique({
      where: { workspaceId_fileName: { workspaceId, fileName } },
      select: { id: true },
    });

    return uploadedFile !== null;
  }

  /**
   * Replace the text of every name this workspace already holds, and insert the rest.
   *
   * One transaction covers the whole request, so a failure part way leaves no file of that upload stored.
   * A replaced file gets a new `updatedAt`, which is how the next sync pass learns to re-embed it.
   */
  async saveUploadedFiles(
    workspaceId: string,
    files: readonly { fileName: string; text: string }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      files.map((file) =>
        this.prisma.uploadedFile.upsert({
          where: { workspaceId_fileName: { workspaceId, fileName: file.fileName } },
          create: { workspaceId, fileName: file.fileName, text: file.text },
          update: { text: file.text },
          select: { id: true },
        }),
      ),
    );
  }

  /** Delete one uploaded file. A name this workspace does not hold succeeds, because the caller wants it absent. */
  async deleteUploadedFile(workspaceId: string, fileName: string): Promise<void> {
    await this.prisma.uploadedFile.deleteMany({ where: { workspaceId, fileName } });
  }

  /** Delete every uploaded file of this workspace. */
  async deleteUploadedFiles(workspaceId: string): Promise<void> {
    await this.prisma.uploadedFile.deleteMany({ where: { workspaceId } });
  }
}
