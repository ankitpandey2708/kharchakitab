export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "pass",
      timestamp: new Date().toISOString(),
      service: "kharchakitab-api",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
