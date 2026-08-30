export interface QuantitySpec {
  id: string;
  nameKo: string;
  nameEn: string;
  siUnit: string;
}

/** Display fallback if the Python catalog endpoint is unreachable. */
export const FALLBACK_QUANTITIES: QuantitySpec[] = [
  { id: "pressure", nameKo: "압력", nameEn: "Pressure", siUnit: "Pa" },
  { id: "temperature", nameKo: "온도", nameEn: "Temperature", siUnit: "K" },
  { id: "enthalpy", nameKo: "엔탈피", nameEn: "Specific enthalpy", siUnit: "J/kg" },
  { id: "mass_flow", nameKo: "질량유량", nameEn: "Mass flow", siUnit: "kg/s" },
  { id: "volume_flow", nameKo: "체적유량", nameEn: "Volume flow", siUnit: "m3/s" },
  { id: "length", nameKo: "길이", nameEn: "Length", siUnit: "m" },
  { id: "mass", nameKo: "질량", nameEn: "Mass", siUnit: "kg" },
  { id: "time", nameKo: "시간", nameEn: "Time", siUnit: "s" },
  { id: "power", nameKo: "동력", nameEn: "Power", siUnit: "W" },
  { id: "energy", nameKo: "에너지", nameEn: "Energy", siUnit: "J" },
  { id: "density", nameKo: "밀도", nameEn: "Density", siUnit: "kg/m3" },
  { id: "area", nameKo: "면적", nameEn: "Area", siUnit: "m2" },
  { id: "volume", nameKo: "체적", nameEn: "Volume", siUnit: "m3" },
  { id: "velocity", nameKo: "속도", nameEn: "Velocity", siUnit: "m/s" },
  { id: "dimensionless", nameKo: "무차원", nameEn: "Dimensionless", siUnit: "1" },
];

export function siUnitFor(quantityId: string | null | undefined, catalog: QuantitySpec[]): string | null {
  if (!quantityId) return null;
  return catalog.find((item) => item.id === quantityId)?.siUnit ?? null;
}
