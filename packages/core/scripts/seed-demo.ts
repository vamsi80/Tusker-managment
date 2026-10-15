/**
 * Demo workspace for client walkthroughs. Wipes and rebuilds "Demo Interiors"
 * plus one login per workspace role, all with DEMO_PASSWORD. Re-run any time a
 * demo leaves the data messy:  pnpm db:seed-demo
 *
 * Everything lives in its own workspace. Logins are <role>.guest@thewhitetusker.com,
 * filler teammates are @demo.tusker.app; nothing is visible from real workspaces.
 */
import crypto from "crypto";
import prisma from "@tusker/db";
import { hashPassword } from "better-auth/crypto";

const SLUG = "demo-interiors";
const DOMAIN = "demo.tusker.app";
const DEMO_PASSWORD = "Guest@123";
const guestEmail = (key: string) => `${key}.guest@thewhitetusker.com`;

const uuid = () => crypto.randomUUID();
const DAY = 86_400_000;
const now = new Date();
const daysFromNow = (d: number, hour = 10) => {
  const date = new Date(now.getTime() + d * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const dateOnly = (d: number) => {
  const date = new Date(now.getTime() + d * DAY);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

// ---------------------------------------------------------------- reset

async function reset() {
  const ws = await prisma.workspace.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (ws) {
    const workspaceId = ws.id;
    // These FKs are ON DELETE RESTRICT, so they have to go before the workspace cascade.
    await prisma.purchaseOrder.deleteMany({ where: { workspaceId } });
    await prisma.indent.deleteMany({ where: { workspaceId } });
    await prisma.projectMaterialItem.deleteMany({ where: { project: { workspaceId } } });
    await prisma.dailyReport.deleteMany({ where: { workspaceId } });
    await prisma.task.deleteMany({ where: { workspaceId, isParent: false } });
    await prisma.task.deleteMany({ where: { workspaceId } });
    await prisma.poSequence.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
  }
  // Exact guest emails only, never a domain match on thewhitetusker.com.
  const guests = PEOPLE.filter((p) => p.login).map((p) => guestEmail(p.key));
  await prisma.user.deleteMany({
    where: { OR: [{ email: { endsWith: `@${DOMAIN}` } }, { email: { in: guests } }] },
  });
}

// ---------------------------------------------------------------- people

type Person = {
  key: string;
  name: string;
  surname: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "PROCUREMENT" | "ACCOUNTS" | "MEMBER" | "VIEWER";
  designation: string;
  dept: string;
  login: boolean;
  reportTo?: string;
};

const PEOPLE: Person[] = [
  { key: "owner", name: "Arjun", surname: "Kapoor", role: "OWNER", designation: "Managing Director", dept: "Management", login: true },
  { key: "admin", name: "Neha", surname: "Iyer", role: "ADMIN", designation: "Operations Head", dept: "Management", login: true, reportTo: "owner" },
  { key: "manager", name: "Rahul", surname: "Mehta", role: "MANAGER", designation: "Project Manager", dept: "Site Execution", login: true, reportTo: "admin" },
  { key: "procurement", name: "Vikram", surname: "Rao", role: "PROCUREMENT", designation: "Procurement Executive", dept: "Procurement", login: true, reportTo: "admin" },
  { key: "accounts", name: "Sneha", surname: "Pillai", role: "ACCOUNTS", designation: "Accounts Manager", dept: "Accounts", login: true, reportTo: "owner" },
  { key: "member", name: "Priya", surname: "Sharma", role: "MEMBER", designation: "Interior Designer", dept: "Design", login: true, reportTo: "manager" },
  { key: "viewer", name: "Karan", surname: "Malhotra", role: "VIEWER", designation: "Client Coordinator", dept: "Management", login: true, reportTo: "admin" },
  { key: "ananya", name: "Ananya", surname: "Reddy", role: "MEMBER", designation: "3D Visualiser", dept: "Design", login: false, reportTo: "manager" },
  { key: "suresh", name: "Suresh", surname: "Kumar", role: "MEMBER", designation: "Site Supervisor", dept: "Site Execution", login: false, reportTo: "manager" },
  { key: "imran", name: "Imran", surname: "Khan", role: "MEMBER", designation: "Carpentry Lead", dept: "Site Execution", login: false, reportTo: "manager" },
  { key: "divya", name: "Divya", surname: "Nair", role: "MEMBER", designation: "HR Executive", dept: "HR", login: false, reportTo: "admin" },
];

// ---------------------------------------------------------------- main

async function main() {
  console.log("[demo] Resetting previous demo data...");
  await reset();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Users ------------------------------------------------------------------
  const users: Record<string, { id: string; email: string }> = {};
  for (const [i, p] of PEOPLE.entries()) {
    const id = uuid();
    const email = p.login ? guestEmail(p.key) : `${p.name.toLowerCase()}@${DOMAIN}`;
    await prisma.user.create({
      data: {
        id,
        name: p.name,
        surname: p.surname,
        email,
        emailVerified: true,
        phoneNumber: `+9190000000${String(i).padStart(2, "0")}`,
        role: "user",
      },
    });
    if (p.login) {
      await prisma.account.create({
        data: { id: uuid(), userId: id, accountId: id, providerId: "credential", password: passwordHash },
      });
    }
    users[p.key] = { id, email };
  }

  // Workspace (same shape WorkspaceService.createWorkspace produces) ---------
  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Interiors",
      slug: SLUG,
      description: "Sample workspace for product demos",
      ownerId: users.owner.id,
      inviteCode: `DEMO${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      legalName: "Demo Interiors Private Limited",
      companyType: "Private Limited",
      industry: "Interior Design & Fit-outs",
      email: "hello@demo.tusker.app",
      phone: "+91 80 4000 1234",
      website: "https://demo.tusker.app",
      gstNumber: "29AABCD1234E1Z5",
      panNumber: "AABCD1234E",
      addressLine1: "42, 100 Feet Road",
      addressLine2: "Indiranagar",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560038",
      nextVendorNumber: 7,
      nextMaterialNumber: 13,
      shiftSchedules: {
        create: ["Head Office", "Factory"].map((name) => ({
          name,
          lateThreshold: "09:45",
          halfDayThreshold: "11:30",
          shiftStartTime: "09:30",
          shiftEndTime: "18:30",
          overtimeThreshold: "19:30",
        })),
      },
    },
    include: { shiftSchedules: true },
  });
  const workspaceId = workspace.id;
  const headOffice = workspace.shiftSchedules.find((s) => s.name === "Head Office")!;
  const factory = workspace.shiftSchedules.find((s) => s.name === "Factory")!;

  // Departments --------------------------------------------------------------
  const depts: Record<string, string> = {};
  for (const name of ["Management", "Design", "Site Execution", "Procurement", "Accounts", "HR"]) {
    const d = await prisma.department.create({
      data: { workspaceId, name, shiftScheduleId: name === "Site Execution" ? factory.id : headOffice.id },
    });
    depts[name] = d.id;
  }

  // Members (reportTo needs the target to exist, PEOPLE is ordered for that) -
  const wm: Record<string, string> = {};
  for (const [i, p] of PEOPLE.entries()) {
    const m = await prisma.workspaceMember.create({
      data: {
        userId: users[p.key].id,
        workspaceId,
        workspaceRole: p.role,
        designation: p.designation,
        departmentId: depts[p.dept],
        employeeId: `DI-${String(101 + i)}`,
        reportToId: p.reportTo ? wm[p.reportTo] : null,
        position: i,
        casualLeaveBalance: 6,
        sickLeaveBalance: 10,
        dateOfBirth: new Date(Date.UTC(1988 + (i % 8), i % 12, 5 + i)),
      },
    });
    wm[p.key] = m.id;
  }

  // Units of measure (same list seed-units.ts writes) -------------------------
  const UNITS = [
    ["pcs", "Pieces", "quantity"], ["nos", "Numbers", "quantity"], ["kg", "Kilogram", "weight"],
    ["ton", "Tonne", "weight"], ["gm", "Gram", "weight"], ["ltr", "Litre", "volume"],
    ["ml", "Millilitre", "volume"], ["mtr", "Metre", "length"], ["ft", "Feet", "length"],
    ["cm", "Centimetre", "length"], ["sqft", "Square Feet", "area"], ["sqmtr", "Square Metre", "area"],
    ["bag", "Bag", "packaging"], ["box", "Box", "packaging"], ["roll", "Roll", "packaging"],
  ];
  await prisma.unitOfMeasure.createMany({
    data: UNITS.map(([abbreviation, name, category]) => ({ workspaceId, abbreviation, name, category, isDefault: true })),
  });
  const unitIds = Object.fromEntries(
    (await prisma.unitOfMeasure.findMany({ where: { workspaceId } })).map((u) => [u.abbreviation, u.id]),
  );

  // Clients -------------------------------------------------------------------
  const clientData = [
    { name: "Skyline Tech Parks", company: "Skyline Tech Parks Pvt Ltd", director: "Rohit Bansal", gst: "29AAKCS4521L1ZQ", address: "Outer Ring Road, Marathahalli, Bengaluru", contacts: [["Meera Joshi", "meera@skylinetech.example"], ["Anil Verma", "anil@skylinetech.example"]] },
    { name: "Hotel Saffron Stays", company: "Saffron Hospitality LLP", director: "Farah Siddiqui", gst: "29ABFFS7788K1Z2", address: "MG Road, Bengaluru", contacts: [["Farah Siddiqui", "farah@saffronstays.example"]] },
    { name: "The Menon Residence", company: "Ravi & Lakshmi Menon", director: "Ravi Menon", gst: null, address: "Whitefield, Bengaluru", contacts: [["Ravi Menon", "ravi.menon@example.com"], ["Lakshmi Menon", "lakshmi.menon@example.com"]] },
  ];
  const clients: string[] = [];
  for (const c of clientData) {
    const created = await prisma.clints.create({
      data: {
        workspaceId,
        name: c.name,
        registeredCompanyName: c.company,
        directorName: c.director,
        gstNumber: c.gst,
        address: c.address,
        clintMembers: {
          create: c.contacts.map(([name, email], i) => ({ name, email, phoneNumber: `+91 98450 1${i}${clients.length}234` })),
        },
      },
    });
    clients.push(created.id);
  }

  // Tags ----------------------------------------------------------------------
  const tags: Record<string, string> = {};
  for (const [name, requirePurchase] of [
    ["Urgent", false], ["Civil", true], ["Electrical", true], ["Carpentry", true],
    ["Painting", true], ["Design", false], ["Client Approval", false],
  ] as const) {
    tags[name] = (await prisma.tag.create({ data: { workspaceId, name, requirePurchase } })).id;
  }

  // Projects ------------------------------------------------------------------
  const projectDefs = [
    { key: "office", name: "Skyline Corporate Office Fit-out", color: "#4F46E5", client: 0, pm: "manager", category: "WHITE_TUSKER" as const, tags: ["Civil", "Electrical", "Carpentry"], description: "45,000 sq ft corporate office interiors across two floors: workstations, cabins, pantry and conference rooms.", team: ["manager", "member", "ananya", "suresh", "imran", "procurement", "viewer"] },
    { key: "hotel", name: "Saffron Stays Lobby Renovation", color: "#EA580C", client: 1, pm: "manager", category: "LATTICE_LANE" as const, tags: ["Painting", "Carpentry", "Design"], description: "Lobby, reception and lounge renovation for a 4-star hotel with a heritage theme.", team: ["manager", "member", "ananya", "imran", "procurement"] },
    { key: "villa", name: "Menon Residence Interiors", color: "#059669", client: 2, pm: "admin", category: "WHITE_TUSKER" as const, tags: ["Design", "Client Approval"], description: "Complete 4BHK villa interiors: modular kitchen, wardrobes, false ceiling and lighting.", team: ["admin", "member", "ananya", "suresh", "viewer"] },
    { key: "studio", name: "Experience Studio Setup", color: "#DB2777", client: null, pm: "admin", category: "MISCELLANEOUS" as const, tags: ["Design"], description: "Internal material library and client experience studio at the head office.", team: ["admin", "manager", "member", "divya", "procurement"] },
  ];

  const projects: Record<string, string> = {};
  const pm: Record<string, Record<string, string>> = {}; // project -> person -> ProjectMember id
  for (const p of projectDefs) {
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: p.name,
        slug: `demo-${p.key}-${crypto.randomBytes(3).toString("hex")}`,
        color: p.color,
        description: p.description,
        category: p.category,
        createdBy: users.owner.id,
        projectManagerId: wm[p.pm],
        clintId: p.client === null ? null : clients[p.client],
        tags: { connect: p.tags.map((t) => ({ id: tags[t] })) },
      },
    });
    projects[p.key] = project.id;
    pm[p.key] = {};
    // The owner is on every project so their views are never empty.
    for (const person of new Set(["owner", ...p.team])) {
      const role =
        person === p.pm ? "PROJECT_MANAGER" : person === "viewer" ? "VIEWER" : person === "owner" ? "LEAD" : person === "suresh" ? "PROJECT_COORDINATOR" : "MEMBER";
      const member = await prisma.projectMember.create({
        data: { projectId: project.id, workspaceMemberId: wm[person], projectRole: role, hasAccess: true },
      });
      pm[p.key][person] = member.id;
    }
  }

  // Tasks + subtasks ----------------------------------------------------------
  type Sub = [name: string, assignee: string, status: string, start: number, due: number];
  type Parent = { name: string; status: string; assignee: string; reviewer: string; start: number; due: number; tags: string[]; subs: Sub[] };
  const S = (name: string, assignee: string, status: string, start: number, due: number): Sub => [name, assignee, status, start, due];

  const taskPlan: Record<string, Parent[]> = {
    office: [
      { name: "Site survey & measurements", status: "COMPLETED", assignee: "suresh", reviewer: "manager", start: -30, due: -24, tags: ["Civil"], subs: [S("Floor 4 laser measurement", "suresh", "COMPLETED", -30, -28), S("Floor 5 laser measurement", "suresh", "COMPLETED", -28, -26), S("Existing services audit", "imran", "COMPLETED", -27, -24)] },
      { name: "Space planning & layouts", status: "COMPLETED", assignee: "member", reviewer: "manager", start: -24, due: -15, tags: ["Design"], subs: [S("Workstation layout options", "member", "COMPLETED", -24, -20), S("Cabin & meeting room zoning", "member", "COMPLETED", -20, -17), S("Client sign-off on layout", "manager", "COMPLETED", -17, -15)] },
      { name: "3D renders – reception & pantry", status: "REVIEW", assignee: "ananya", reviewer: "member", start: -12, due: 2, tags: ["Design", "Client Approval"], subs: [S("Reception render v2", "ananya", "COMPLETED", -12, -6), S("Pantry render", "ananya", "REVIEW", -6, 0), S("Material board for renders", "member", "IN_PROGRESS", -4, 2)] },
      { name: "False ceiling & partitions", status: "IN_PROGRESS", assignee: "suresh", reviewer: "manager", start: -8, due: 10, tags: ["Civil"], subs: [S("Gypsum framing – Floor 4", "suresh", "COMPLETED", -8, -2), S("Glass partitions – cabins", "imran", "IN_PROGRESS", -3, 6), S("Acoustic ceiling – conference", "suresh", "TO_DO", 4, 10), S("Ceiling punch list", "member", "TO_DO", 8, 10)] },
      { name: "Electrical & lighting", status: "IN_PROGRESS", assignee: "imran", reviewer: "manager", start: -5, due: 14, tags: ["Electrical", "Urgent"], subs: [S("Conduiting & wiring", "imran", "IN_PROGRESS", -5, 4), S("Lighting fixture selection", "member", "IN_PROGRESS", -3, -1), S("DB & panel installation", "imran", "TO_DO", 5, 14)] },
      { name: "Workstation carpentry", status: "TO_DO", assignee: "imran", reviewer: "manager", start: 7, due: 28, tags: ["Carpentry"], subs: [S("Shop drawings approval", "member", "TO_DO", 7, 10), S("Factory production – 180 seats", "imran", "TO_DO", 10, 24), S("Installation & alignment", "suresh", "TO_DO", 24, 28)] },
      { name: "HVAC coordination", status: "HOLD", assignee: "suresh", reviewer: "manager", start: -10, due: 5, tags: ["Civil"], subs: [S("Duct routing with MEP consultant", "suresh", "HOLD", -10, 0), S("Revised RCP from client", "manager", "HOLD", -6, 5)] },
    ],
    hotel: [
      { name: "Heritage theme moodboards", status: "COMPLETED", assignee: "ananya", reviewer: "member", start: -20, due: -14, tags: ["Design"], subs: [S("Colour palette study", "ananya", "COMPLETED", -20, -17), S("Furniture references", "member", "COMPLETED", -18, -14)] },
      { name: "Reception desk design", status: "REVIEW", assignee: "member", reviewer: "manager", start: -10, due: 1, tags: ["Design", "Client Approval"], subs: [S("Marble & brass detailing", "member", "REVIEW", -10, -2), S("Desk shop drawing", "imran", "IN_PROGRESS", -4, 1)] },
      { name: "Lounge wall paneling", status: "IN_PROGRESS", assignee: "imran", reviewer: "manager", start: -6, due: 9, tags: ["Carpentry"], subs: [S("Veneer sampling", "member", "COMPLETED", -6, -3), S("Panel fabrication", "imran", "IN_PROGRESS", -3, 6), S("On-site fixing", "imran", "TO_DO", 6, 9)] },
      { name: "Lobby painting & textures", status: "TO_DO", assignee: "imran", reviewer: "manager", start: 3, due: 15, tags: ["Painting"], subs: [S("Surface preparation", "imran", "TO_DO", 3, 6), S("Texture mock-up for client", "member", "TO_DO", 5, 8), S("Final coat", "imran", "TO_DO", 10, 15)] },
      { name: "Chandelier procurement", status: "CANCELLED", assignee: "procurement", reviewer: "manager", start: -15, due: -5, tags: ["Electrical"], subs: [S("Import quote comparison", "procurement", "CANCELLED", -15, -8)] },
    ],
    villa: [
      { name: "Concept presentation", status: "COMPLETED", assignee: "member", reviewer: "admin", start: -25, due: -18, tags: ["Design", "Client Approval"], subs: [S("Living & dining concept", "member", "COMPLETED", -25, -21), S("Bedroom concepts", "ananya", "COMPLETED", -22, -18)] },
      { name: "Modular kitchen design", status: "IN_PROGRESS", assignee: "member", reviewer: "admin", start: -9, due: 4, tags: ["Design"], subs: [S("Kitchen layout & appliances", "member", "COMPLETED", -9, -5), S("Shutter finish selection with client", "member", "IN_PROGRESS", -5, -1), S("Final kitchen drawings", "ananya", "TO_DO", 0, 4)] },
      { name: "Wardrobes – 4 bedrooms", status: "TO_DO", assignee: "ananya", reviewer: "admin", start: 2, due: 20, tags: ["Design"], subs: [S("Internal configurations", "ananya", "TO_DO", 2, 8), S("Laminate & handle selection", "member", "TO_DO", 6, 10)] },
      { name: "False ceiling & cove lighting", status: "REVIEW", assignee: "suresh", reviewer: "admin", start: -7, due: 3, tags: ["Design"], subs: [S("RCP drawing", "member", "COMPLETED", -7, -3), S("Lighting load calculation", "suresh", "REVIEW", -3, 3)] },
    ],
    studio: [
      { name: "Material library shelving", status: "IN_PROGRESS", assignee: "manager", reviewer: "admin", start: -4, due: 8, tags: ["Design"], subs: [S("Sample sourcing list", "procurement", "IN_PROGRESS", -4, 2), S("Shelving layout", "member", "COMPLETED", -4, -1)] },
      { name: "Team onboarding kit", status: "TO_DO", assignee: "divya", reviewer: "admin", start: 1, due: 12, tags: [], subs: [S("Induction deck", "divya", "TO_DO", 1, 6), S("Studio tour checklist", "member", "TO_DO", 4, 12)] },
    ],
  };

  const taskIds: Record<string, string> = {}; // name -> id (parents + subs)
  const memberSubtasks: string[] = [];
  for (const [projectKey, parents] of Object.entries(taskPlan)) {
    const members = pm[projectKey];
    const creator = members[projectDefs.find((p) => p.key === projectKey)!.pm];
    for (const [pi, t] of parents.entries()) {
      const completed = t.subs.filter((s) => s[2] === "COMPLETED").length;
      const parent = await prisma.task.create({
        data: {
          workspaceId,
          projectId: projects[projectKey],
          name: t.name,
          description: `${t.name} for ${projectDefs.find((p) => p.key === projectKey)!.name}.`,
          status: t.status as any,
          taskSlug: `demo-${projectKey}-${pi}-${crypto.randomBytes(3).toString("hex")}`,
          createdById: creator,
          assigneeId: members[t.assignee] ?? creator,
          reviewerId: members[t.reviewer] ?? creator,
          startDate: daysFromNow(t.start, 9),
          dueDate: daysFromNow(t.due, 18),
          days: Math.max(1, t.due - t.start),
          position: pi,
          isParent: true,
          subtaskCount: t.subs.length,
          completedSubtaskCount: completed,
          tags: { connect: t.tags.map((name) => ({ id: tags[name] })) },
        },
      });
      taskIds[t.name] = parent.id;
      for (const [si, [name, assignee, status, start, due]] of t.subs.entries()) {
        const sub = await prisma.task.create({
          data: {
            workspaceId,
            projectId: projects[projectKey],
            parentTaskId: parent.id,
            isParent: false,
            name,
            description: `${name}. Part of "${t.name}".`,
            status: status as any,
            taskSlug: `demo-${projectKey}-${pi}-${si}-${crypto.randomBytes(3).toString("hex")}`,
            createdById: creator,
            assigneeId: members[assignee] ?? creator,
            reviewerId: members[t.reviewer] ?? creator,
            startDate: daysFromNow(start, 9),
            dueDate: daysFromNow(due, 18),
            days: Math.max(1, due - start),
            position: si,
            path: parent.id,
          },
        });
        taskIds[name] = sub.id;
        if (assignee === "member") memberSubtasks.push(sub.id);
      }
    }
  }

  // Dependencies (A blocks B)
  const dep = (a: string, b: string) =>
    prisma.task.update({ where: { id: taskIds[b] }, data: { Task_TaskDependency_A: { connect: { id: taskIds[a] } } } });
  await dep("Space planning & layouts", "3D renders – reception & pantry");
  await dep("False ceiling & partitions", "Workstation carpentry");
  await dep("Modular kitchen design", "Wardrobes – 4 bedrooms");

  // Comments + subtask activity ---------------------------------------------
  const comments: [task: string, who: string, text: string][] = [
    ["3D renders – reception & pantry", "manager", "Client wants a warmer wood tone on the reception backdrop. Please revise before Friday."],
    ["3D renders – reception & pantry", "ananya", "Noted, sharing v3 with walnut veneer by tomorrow."],
    ["Electrical & lighting", "owner", "Ensure all fixtures are BEE 5-star rated, the client asked for it in the kickoff."],
    ["HVAC coordination", "suresh", "On hold until the MEP consultant shares the revised duct layout."],
    ["Reception desk design", "manager", "Brass inlay looks great. Check lead time on the Italian marble."],
    ["Modular kitchen design", "member", "Client shortlisted acrylic gloss in Ivory. Sample sent for approval."],
  ];
  for (const [task, who, content] of comments) {
    await prisma.comment.create({ data: { taskId: taskIds[task], userId: users[who].id, content } });
  }
  const activities: [subtask: string, who: string, text: string][] = [
    ["Pantry render", "ananya", "Uploaded pantry render v2 with updated counter finish."],
    ["Glass partitions – cabins", "imran", "Toughened glass delivered on site. Installation starts tomorrow."],
    ["Conduiting & wiring", "imran", "Floor 4 conduiting 70% complete."],
    ["Shutter finish selection with client", "member", "Shared 3 shutter samples with the Menons, awaiting feedback."],
    ["Marble & brass detailing", "member", "Detailing sent for review."],
  ];
  for (const [subtask, who, text] of activities) {
    await prisma.activity.create({ data: { workspaceId, subTaskId: taskIds[subtask], authorId: users[who].id, text } });
  }

  // Material catalog + vendors ------------------------------------------------
  const materials = [
    ["Gypsum Board 12.5mm", "sqft"], ["GI Channel Section", "mtr"], ["Toughened Glass 12mm", "sqft"],
    ["Plywood BWP 18mm", "sqft"], ["Laminate 1mm", "sqft"], ["Teak Veneer", "sqft"],
    ["LED Panel Light 2x2", "nos"], ["FR Copper Wire 2.5 sqmm", "roll"], ["Emulsion Paint", "ltr"],
    ["Wall Putty", "bag"], ["Vitrified Tiles 600x600", "box"], ["Italian Marble", "sqft"],
  ];
  const mat: Record<string, string> = {};
  for (const [i, [name, unit]] of materials.entries()) {
    const m = await prisma.materialCatalog.create({
      data: { workspaceId, materialId: `MAT-${String(i + 1).padStart(4, "0")}`, name, unit, source: "MANUAL", defaultUnitId: unitIds[unit] },
    });
    mat[name] = m.id;
  }

  const vendorDefs = [
    { name: "Shree Balaji Building Materials", type: "SUPPLIER", status: "ACTIVE", contact: "Mahesh Agarwal", city: "Bengaluru", gst: "29AAFPB1234C1Z1", caps: [["Gypsum Board 12.5mm", 52], ["GI Channel Section", 85], ["Wall Putty", 720]] },
    { name: "ClearView Glass Solutions", type: "SUPPLIER", status: "ACTIVE", contact: "Joseph D'Souza", city: "Bengaluru", gst: "29AACCC5678D1Z2", caps: [["Toughened Glass 12mm", 210]] },
    { name: "Woodcraft Ply & Laminates", type: "SUPPLIER", status: "ACTIVE", contact: "Harish Jain", city: "Mysuru", gst: "29AAGFW9012E1Z3", caps: [["Plywood BWP 18mm", 118], ["Laminate 1mm", 62], ["Teak Veneer", 145]] },
    { name: "Brightline Electricals", type: "SUPPLIER", status: "ACTIVE", contact: "Santosh Kulkarni", city: "Hubballi", gst: "29AABCB3456F1Z4", caps: [["LED Panel Light 2x2", 1450], ["FR Copper Wire 2.5 sqmm", 2650]] },
    { name: "Perfect Finish Painting Contractors", type: "CONTRACTOR", status: "ACTIVE", contact: "Ramesh Gowda", city: "Bengaluru", gst: null, caps: [["Emulsion Paint", 340]] },
    { name: "Royal Stone Imports", type: "SUPPLIER", status: "INACTIVE", contact: "Kabir Shah", city: "Kishangarh", gst: "08AAJFR7890G1Z5", caps: [["Italian Marble", 780], ["Vitrified Tiles 600x600", 1650]] },
  ] as const;
  const vendors: string[] = [];
  for (const [i, v] of vendorDefs.entries()) {
    const vendor = await prisma.vendor.create({
      data: {
        workspaceId,
        vendorId: `VEN-${String(i + 1).padStart(4, "0")}`,
        name: v.name,
        companyName: v.name,
        contactPerson: v.contact,
        email: `sales@${v.name.split(" ")[0].toLowerCase()}.example`,
        phoneNumber: `+91 99000 2${i}${i}${i}${i}`,
        addressLine1: `${10 + i}, Industrial Area Phase ${i + 1}`,
        city: v.city,
        state: v.gst?.startsWith("08") ? "Rajasthan" : "Karnataka",
        pincode: `5600${50 + i}`,
        gstNumber: v.gst,
        hasGst: !!v.gst,
        gstStatus: v.gst ? "Active" : null,
        status: v.status,
        isActive: v.status === "ACTIVE",
        vendorType: v.type,
      },
    });
    vendors.push(vendor.id);
    for (const [name, rupees] of v.caps) {
      await prisma.vendorMaterialCapability.create({
        data: {
          workspaceId,
          vendorId: vendor.id,
          materialCatalogId: mat[name],
          materialName: name,
          unit: materials.find(([n]) => n === name)![1],
          rate: rupees * 100,
          quantity: 100,
          serviceType: v.type === "CONTRACTOR" ? "LABOUR_WITH_MATERIAL" : "SUPPLY",
        },
      });
    }
  }

  // Indents -------------------------------------------------------------------
  // DEMO- prefix: the real IND- counter is max+1 across all workspaces.
  type Line = [material: string, qty: number, estRupees: number];
  const indentDefs: { name: string; project: string; status: any; requester: string; assignee?: string; lines: Line[]; extra?: object }[] = [
    { name: "Gypsum & framing – Floor 5", project: "office", status: "PENDING_OWNER_APPROVAL", requester: "suresh", lines: [["Gypsum Board 12.5mm", 4200, 52], ["GI Channel Section", 1800, 85]], extra: { managerApprovedAt: daysFromNow(-1), managerApprovedById: wm.manager } },
    { name: "Cabin glass partitions", project: "office", status: "COMPARATIVES_IN_PROGRESS", requester: "imran", assignee: "procurement", lines: [["Toughened Glass 12mm", 950, 210]], extra: { managerApprovedAt: daysFromNow(-6), managerApprovedById: wm.manager, ownerAuthorizedAt: daysFromNow(-5), approvedByIds: [wm.owner] } },
    { name: "Lobby wall paneling material", project: "hotel", status: "SUBMITTED", requester: "member", lines: [["Plywood BWP 18mm", 600, 118], ["Teak Veneer", 600, 145]] },
    { name: "Office lighting package", project: "office", status: "APPROVED", requester: "imran", assignee: "procurement", lines: [["LED Panel Light 2x2", 220, 1450], ["FR Copper Wire 2.5 sqmm", 40, 2650]], extra: { managerApprovedAt: daysFromNow(-14), managerApprovedById: wm.manager, ownerAuthorizedAt: daysFromNow(-13), finalApprovedAt: daysFromNow(-9), finalApprovedById: wm.owner, approvedByIds: [wm.owner], finalOwnerApprovedByIds: [wm.owner] } },
    { name: "Kitchen shutter laminates", project: "villa", status: "PENDING_MANAGER_FINAL_RATE_APPROVAL", requester: "member", assignee: "procurement", lines: [["Laminate 1mm", 320, 62]], extra: { finalRatesSubmittedAt: daysFromNow(-1), finalRatesSubmittedById: wm.procurement } },
    { name: "Studio sample tiles", project: "studio", status: "DRAFT", requester: "member", lines: [["Vitrified Tiles 600x600", 12, 1650]] },
  ];
  const indents: Record<string, { id: string; lines: string[] }> = {};
  for (const [i, d] of indentDefs.entries()) {
    const submitted = d.status !== "DRAFT";
    const indent = await prisma.indent.create({
      data: {
        workspaceId,
        indentId: `DEMO-${String(i + 1).padStart(4, "0")}`,
        projectId: projects[d.project],
        name: d.name,
        description: `Material requirement for ${d.name.toLowerCase()}.`,
        status: d.status,
        requestedById: wm[d.requester],
        raisedInProject: true,
        assignedToId: d.assignee ? wm[d.assignee] : null,
        submittedAt: submitted ? daysFromNow(-3 - i * 2) : null,
        expectedDelivery: daysFromNow(10 + i * 3),
        taxPercent: 18,
        transportCharge: 250000,
        approverIds: [wm.owner],
        ...d.extra,
      },
    });
    const lineIds: string[] = [];
    for (const [material, quantity, est] of d.lines) {
      const status = d.status === "APPROVED" ? "PO_CREATED" : d.status === "COMPARATIVES_IN_PROGRESS" ? "QUOTES_RECEIVED" : "PENDING";
      const line = await prisma.indentLineItem.create({
        data: {
          indentId: indent.id,
          materialCatalogId: mat[material],
          materialName: material,
          unit: materials.find(([n]) => n === material)![1],
          quantity,
          estimatedUnitPrice: est * 100,
          finalUnitPrice: d.status === "APPROVED" ? Math.round(est * 0.96) * 100 : null,
          status,
        },
      });
      lineIds.push(line.id);
    }
    indents[d.name] = { id: indent.id, lines: lineIds };
  }

  // Comparative quotes on the glass indent, and the approved quote on lighting.
  const glass = indents["Cabin glass partitions"].lines[0];
  for (const [vi, price, lead] of [[1, 205, 7], [0, 228, 10], [5, 240, 14]] as const) {
    await prisma.vendorQuote.create({
      data: { lineItemId: glass, vendorId: vendors[vi], unitPrice: price, quantity: 950, totalPrice: price * 950, leadTimeDays: lead, validUntil: daysFromNow(20), status: "SUBMITTED", notes: "Inclusive of delivery to site." },
    });
  }
  const lighting = indents["Office lighting package"];
  for (const [li, price, qty] of [[0, 1390, 220], [1, 2550, 40]] as const) {
    const quote = await prisma.vendorQuote.create({
      data: { lineItemId: lighting.lines[li], vendorId: vendors[3], unitPrice: price, quantity: qty, totalPrice: price * qty, leadTimeDays: 5, status: "APPROVED", reviewedAt: daysFromNow(-9), reviewedById: wm.procurement },
    });
    await prisma.indentLineItem.update({ where: { id: lighting.lines[li] }, data: { approvedQuoteId: quote.id } });
  }
  await prisma.indent.update({ where: { id: lighting.id }, data: { selectedVendorId: vendors[3] } });

  // Purchase orders -----------------------------------------------------------
  const fy = (() => {
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
  })();
  const poDefs = [
    { vendor: 3, indent: lighting.id, status: "DELIVERED", ago: -8, items: [["LED Panel Light 2x2", "nos", 220, 1390], ["FR Copper Wire 2.5 sqmm", "roll", 40, 2550]] },
    { vendor: 0, indent: null, status: "ORDERED", ago: -2, items: [["Gypsum Board 12.5mm (advance lot)", "sqft", 1500, 50], ["Wall Putty", "bag", 60, 700]] },
    { vendor: 2, indent: null, status: "CLOSED", ago: -20, items: [["Plywood BWP 18mm – mock-up", "sqft", 200, 115]] },
  ] as const;
  for (const [i, po] of poDefs.entries()) {
    const lines = po.items.map(([description, unit, quantity, rupees], sortOrder) => ({
      description, unit, quantity, rate: rupees * 100, amount: quantity * rupees * 100, taxPercent: 18, sortOrder,
    }));
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const gst = Math.round(subtotal * 0.09);
    await prisma.purchaseOrder.create({
      data: {
        workspaceId,
        poNumber: `WT/${fy}/D${String(i + 1).padStart(3, "0")}`,
        company: "WT",
        financialYear: fy,
        vendorId: vendors[po.vendor],
        indentId: po.indent,
        referenceNo: `QTN-${2400 + i}`,
        poDate: daysFromNow(po.ago),
        deliveryAddress: "Skyline Tech Park, Tower B, Floors 4–5, Outer Ring Road, Marathahalli, Bengaluru 560037",
        subtotal,
        cgst: gst,
        sgst: gst,
        igst: 0,
        transportCharge: 250000,
        grandTotal: subtotal + gst * 2 + 250000,
        status: po.status,
        terms: ["50% advance, balance within 15 days of delivery.", "Delivery within 7 working days.", "Material subject to site QC approval."],
        createdById: wm.accounts,
        items: { create: lines },
      },
    });
  }
  await prisma.poSequence.create({ data: { workspaceId, company: "WT", financialYear: fy, next: poDefs.length + 1 } });

  // Project material items (BOQ) ----------------------------------------------
  for (const [project, subtask, material, unit, quantity, who] of [
    ["office", "Gypsum framing – Floor 4", "Gypsum Board 12.5mm", "sqft", 4200, "suresh"],
    ["office", "Glass partitions – cabins", "Toughened Glass 12mm", "sqft", 950, "imran"],
    ["office", "Conduiting & wiring", "FR Copper Wire 2.5 sqmm", "roll", 40, "imran"],
    ["hotel", "Panel fabrication", "Teak Veneer", "sqft", 600, "member"],
    ["villa", "Final kitchen drawings", "Laminate 1mm", "sqft", 320, "member"],
  ] as const) {
    await prisma.projectMaterialItem.create({
      data: { projectId: projects[project], subtaskId: taskIds[subtask], subtaskNameSnapshot: subtask, materialName: material, unit, quantity, addedById: wm[who] },
    });
  }

  // Meetings ------------------------------------------------------------------
  const meetings = [
    { title: "Weekly project review", type: "PROJECT_REVIEW", project: "office", organizer: "manager", day: 0, hour: 11, mins: 60, status: "SCHEDULED", attendees: ["owner", "member", "suresh", "imran", "procurement"], color: "indigo" },
    { title: "Skyline – reception design walkthrough", type: "CLIENT", project: "office", organizer: "manager", day: 1, hour: 15, mins: 90, status: "SCHEDULED", attendees: ["owner", "member", "ananya", "viewer"], color: "orange", location: "Skyline Tech Park, Tower B" },
    { title: "Saffron Stays – material selection", type: "CLIENT", project: "hotel", organizer: "member", day: 2, hour: 12, mins: 60, status: "SCHEDULED", attendees: ["manager", "ananya"], color: "rose", url: "https://meet.google.com/demo-abc-xyz" },
    { title: "Procurement sync", type: "INTERNAL", project: null, organizer: "procurement", day: 3, hour: 10, mins: 30, status: "SCHEDULED", attendees: ["accounts", "manager", "owner"], color: "emerald" },
    { title: "1:1 – Priya / Rahul", type: "ONE_ON_ONE", project: null, organizer: "manager", day: 4, hour: 17, mins: 30, status: "SCHEDULED", attendees: ["member"], color: "violet" },
    { title: "Menon kitchen finalisation", type: "CLIENT", project: "villa", organizer: "admin", day: 7, hour: 16, mins: 60, status: "SCHEDULED", attendees: ["member", "ananya"], color: "emerald", location: "Experience Studio" },
    { title: "Monthly all-hands", type: "GENERAL", project: null, organizer: "owner", day: 9, hour: 18, mins: 60, status: "SCHEDULED", attendees: PEOPLE.map((p) => p.key).filter((k) => k !== "owner"), color: "indigo" },
    { title: "Site safety audit", type: "INTERNAL", project: "office", organizer: "suresh", day: -2, hour: 10, mins: 60, status: "COMPLETED", attendees: ["manager", "imran"], color: "amber" },
    { title: "Vendor negotiation – glass", type: "INTERNAL", project: "office", organizer: "procurement", day: -1, hour: 14, mins: 45, status: "COMPLETED", attendees: ["manager"], color: "emerald" },
    { title: "Hotel lobby site visit", type: "PROJECT_REVIEW", project: "hotel", organizer: "manager", day: -3, hour: 11, mins: 120, status: "CANCELLED", attendees: ["member", "imran"], color: "rose" },
  ];
  for (const m of meetings) {
    const start = daysFromNow(m.day, m.hour);
    await prisma.meeting.create({
      data: {
        workspaceId,
        title: m.title,
        description: `${m.title}. Agenda shared in the project channel.`,
        startTime: start,
        endTime: new Date(start.getTime() + m.mins * 60_000),
        location: m.location ?? null,
        meetingUrl: m.url ?? null,
        type: m.type as any,
        status: m.status as any,
        color: m.color,
        organizerId: users[m.organizer].id,
        projectId: m.project ? projects[m.project] : null,
        attendees: {
          create: m.attendees.map((k, i) => ({ userId: users[k].id, status: (i === 2 ? "TENTATIVE" : "ACCEPTED") as any })),
        },
      },
    });
  }

  // Attendance: last 10 working days -----------------------------------------
  const workingDays: number[] = [];
  for (let d = -1; workingDays.length < 10; d--) {
    const day = new Date(now.getTime() + d * DAY).getDay();
    if (day !== 0 && day !== 6) workingDays.push(d);
  }
  const attendanceRows = [];
  for (const [pi, p] of PEOPLE.entries()) {
    for (const [di, d] of workingDays.entries()) {
      const roll = (pi * 7 + di * 3) % 20;
      const status = roll === 0 ? "ABSENT" : roll === 1 ? "ON_LEAVE" : roll < 4 ? "LATE" : roll === 4 ? "HALF_DAY" : "PRESENT";
      const date = dateOnly(d);
      const inTime = new Date(now.getTime() + d * DAY);
      inTime.setHours(status === "LATE" ? 10 : 9, status === "LATE" ? 5 + roll : 15 + (roll % 15), 0, 0);
      const outTime = new Date(inTime.getTime() + (status === "HALF_DAY" ? 4 : 9) * 3_600_000);
      const present = status !== "ABSENT" && status !== "ON_LEAVE";
      attendanceRows.push({
        id: uuid(),
        workspaceId,
        workspaceMemberId: wm[p.key],
        date,
        status: status as any,
        checkIn: present ? inTime : null,
        checkOut: present ? outTime : null,
        checkInAddress: present ? "Demo Interiors HQ, Indiranagar, Bengaluru" : null,
        checkInLatitude: present ? 12.9719 : null,
        checkInLongitude: present ? 77.6412 : null,
        updatedAt: now,
      });
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows });
  await prisma.attendanceLocation.create({
    data: { workspaceId, name: "Demo Interiors HQ", address: "42, 100 Feet Road, Indiranagar, Bengaluru", latitude: 12.9719, longitude: 77.6412, radius: 150 },
  });

  // Leave + holidays ----------------------------------------------------------
  await prisma.leave_request.createMany({
    data: [
      { workspaceId, workspaceMemberId: wm.member, startDate: dateOnly(12), endDate: dateOnly(13), reason: "Sister's wedding in Kochi", type: "CASUAL", status: "PENDING" },
      { workspaceId, workspaceMemberId: wm.suresh, startDate: dateOnly(-6), endDate: dateOnly(-6), reason: "Fever", type: "SICK", status: "APPROVED", processedById: wm.manager },
      { workspaceId, workspaceMemberId: wm.ananya, startDate: dateOnly(20), endDate: dateOnly(22), reason: "Family trip", type: "CASUAL", status: "PENDING" },
      { workspaceId, workspaceMemberId: wm.imran, startDate: dateOnly(-15), endDate: dateOnly(-14), reason: "Personal work", type: "CASUAL", status: "REJECTED", processedById: wm.manager },
    ],
  });
  await prisma.public_holiday.createMany({
    data: [
      { workspaceId, name: "Diwali", date: dateOnly(18) },
      { workspaceId, name: "Kannada Rajyotsava", date: dateOnly(29) },
      { workspaceId, name: "Christmas", date: dateOnly(80) },
    ],
  });

  // Daily reports: member + team, last 5 working days ------------------------
  for (const key of ["member", "ananya", "suresh", "imran"]) {
    for (const [i, d] of workingDays.slice(0, 5).entries()) {
      const missed = key === "imran" && i === 2;
      await prisma.dailyReport.create({
        data: {
          workspaceId,
          userId: users[key].id,
          date: dateOnly(d),
          status: missed ? "NOT_SUBMITTED" : "SUBMITTED",
          submittedAt: missed ? null : daysFromNow(d, 19),
          entries: missed
            ? undefined
            : {
                create: [
                  { type: "TASK", taskId: key === "member" ? memberSubtasks[i % memberSubtasks.length] : null, description: "Worked on assigned subtask and updated progress." },
                  { type: "OTHER", description: i % 2 ? "Site visit and client coordination." : "Internal design review." },
                ],
              },
        },
      });
    }
  }

  // Board items, todos, notifications ----------------------------------------
  await prisma.board.createMany({
    data: [
      { workspaceId, memberId: wm.member, assignedById: wm.manager, note: "Send revised pantry render to Skyline before EOD", status: "NOT_DONE" },
      { workspaceId, memberId: wm.procurement, assignedById: wm.manager, note: "Chase ClearView for glass delivery date", status: "NOT_DONE" },
      { workspaceId, memberId: wm.suresh, assignedById: wm.manager, note: "Share site photos of Floor 4 ceiling", status: "DONE" },
      { workspaceId, memberId: wm.accounts, assignedById: wm.owner, note: "Release advance for Brightline PO", status: "DONE" },
    ],
  });
  for (const key of ["member", "manager", "owner"]) {
    await prisma.memberTodo.createMany({
      data: [
        { memberId: wm[key], text: "Review today's site updates", position: 0 },
        { memberId: wm[key], text: "Follow up on pending approvals", position: 1, completed: true, completedAt: now },
        { memberId: wm[key], text: "Prepare notes for weekly review", position: 2 },
      ],
    });
  }
  const notify = (who: string, title: string, body: string, type: string, isRead = false) => ({
    id: uuid(), userId: users[who].id, workspaceId, title, body, type, isRead, createdAt: now, updatedAt: now,
  });
  await prisma.notification.createMany({
    data: [
      notify("owner", "Indent awaiting your approval", "Gypsum & framing – Floor 5 needs owner approval.", "INDENT_APPROVAL"),
      notify("owner", "Leave request", "Priya Sharma requested 2 days of casual leave.", "LEAVE"),
      notify("manager", "Task in review", "Pantry render is ready for review.", "TASK"),
      notify("manager", "Final rates submitted", "Kitchen shutter laminates: final rates await your approval.", "INDENT_APPROVAL"),
      notify("member", "New comment", "Rahul Mehta commented on 3D renders – reception & pantry.", "COMMENT"),
      notify("member", "Meeting tomorrow", "Skyline – reception design walkthrough at 3:00 PM.", "MEETING", true),
      notify("procurement", "Indent assigned", "Cabin glass partitions has been assigned to you for comparatives.", "INDENT"),
      notify("accounts", "PO delivered", "Brightline Electricals marked the lighting PO as delivered.", "PO"),
    ],
  });

  console.log("\n==================== DEMO READY ====================");
  console.log(`Workspace: Demo Interiors (${workspaceId})`);
  console.log(`Password for every login: ${DEMO_PASSWORD}`);
  for (const p of PEOPLE.filter((p) => p.login)) {
    console.log(`  ${p.role.padEnd(12)} ${users[p.key].email.padEnd(38)} ${p.name} ${p.surname}`);
  }
  console.log("====================================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
