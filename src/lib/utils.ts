import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind sınıflarını koşullu birleştirir; çakışan sınıflarda sonuncusu kazanır. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
