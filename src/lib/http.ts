import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { WorkflowError } from "./service";
export function authorize(req: NextRequest) {
  const token = process.env.APP_ACCESS_TOKEN;
  if (token) {
    const given = Buffer.from(
      req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
    );
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new WorkflowError("Access token required.", 401);
  }
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (
      origin &&
      origin !== req.nextUrl.origin &&
      new URL(origin).host !== req.headers.get("host")
    )
      throw new WorkflowError("Cross-origin changes are not allowed.", 403);
  }
}
export function apiError(error: unknown) {
  if (error instanceof WorkflowError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof Error && error.name === "ZodError")
    return NextResponse.json(
      { error: "Invalid request fields." },
      { status: 400 },
    );
  console.error(
    "[Bank-Change Guard]",
    error instanceof Error ? error.message : "Unknown error",
  );
  return NextResponse.json(
    {
      error:
        "The operation could not be completed. Check the server log and retry.",
    },
    { status: 500 },
  );
}
