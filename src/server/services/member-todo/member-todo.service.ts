import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";

export class MemberTodoService {
  /**
   * List all todos for a workspace member
   */
  static async getTodos(memberId: string) {
    return prisma.memberTodo.findMany({
      where: { memberId },
      orderBy: [
        { completed: "asc" },
        { position: "asc" },
        { createdAt: "desc" }
      ],
    });
  }

  /**
   * Create a new todo for a member
   */
  static async createTodo(memberId: string, text: string) {
    if (!text.trim()) {
      throw AppError.ValidationError("Todo text is required");
    }

    const lastTodo = await prisma.memberTodo.findFirst({
      where: { memberId },
      orderBy: { position: "desc" },
    });

    const nextPosition = lastTodo ? lastTodo.position + 1 : 0;

    return prisma.memberTodo.create({
      data: {
        memberId,
        text: text.trim(),
        position: nextPosition,
      },
    });
  }

  /**
   * Edit the text of an existing todo
   */
  static async editTodo(id: string, memberId: string, text: string) {
    if (!text.trim()) {
      throw AppError.ValidationError("Todo text is required");
    }

    const todo = await prisma.memberTodo.findUnique({
      where: { id },
    });

    if (!todo) throw AppError.NotFound("Todo not found");
    if (todo.memberId !== memberId) throw AppError.Forbidden("Access denied");

    return prisma.memberTodo.update({
      where: { id },
      data: { text: text.trim() },
    });
  }

  /**
   * Toggle completed status
   */
  static async toggleTodo(id: string, memberId: string) {
    const todo = await prisma.memberTodo.findUnique({
      where: { id },
    });

    if (!todo) throw AppError.NotFound("Todo not found");
    if (todo.memberId !== memberId) throw AppError.Forbidden("Access denied");

    const completed = !todo.completed;

    return prisma.memberTodo.update({
      where: { id },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });
  }

  /**
   * Delete a todo
   */
  static async deleteTodo(id: string, memberId: string) {
    const todo = await prisma.memberTodo.findUnique({
      where: { id },
    });

    if (!todo) throw AppError.NotFound("Todo not found");
    if (todo.memberId !== memberId) throw AppError.Forbidden("Access denied");

    await prisma.memberTodo.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Reorder todos for a member
   */
  static async reorderTodos(memberId: string, todoIds: string[]) {
    const updates = todoIds.map((id, index) =>
      prisma.memberTodo.updateMany({
        where: { id, memberId },
        data: { position: index },
      })
    );
    await prisma.$transaction(updates);
    return { success: true };
  }
}
