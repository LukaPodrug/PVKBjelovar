import type { UserRole } from "../core/types";

export interface NavigationItem {
  label: string;
  href: string;
  caption: string;
  allowedRoles: UserRole[];
}

export const navigationItems: NavigationItem[] = [
  {
    label: "Pregled",
    href: "/dashboard",
    caption: "Kalendar",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Prijave",
    href: "/approvals",
    caption: "Odobrenja",
    allowedRoles: ["ADMIN"],
  },
  {
    label: "Kategorije",
    href: "/categories",
    caption: "Skupine",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Treneri",
    href: "/coaches",
    caption: "Stručni stožer",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Igrači",
    href: "/players",
    caption: "Popis",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Roditelji",
    href: "/parents",
    caption: "Kontakti",
    allowedRoles: ["ADMIN"],
  },
  {
    label: "Raspored",
    href: "/schedules",
    caption: "Treninzi",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Poredak",
    href: "/leaderboard",
    caption: "Dolasci",
    allowedRoles: ["ADMIN", "COACH"],
  },
  {
    label: "Postavke",
    href: "/settings",
    caption: "Klub",
    allowedRoles: ["ADMIN"],
  },
];
