// Static reference list for development; replace with a vehicle data API response.

export const vehicleCatalog: Record<string, string[]> = {
  Acura: ['ILX', 'Integra', 'MDX', 'RDX', 'TLX'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  BMW: ['3 Series', '5 Series', 'X1', 'X3', 'X5'],
  Chevrolet: ['Bolt EV', 'Camaro', 'Equinox', 'Malibu', 'Silverado 1500', 'Tahoe', 'Traverse', 'Trax'],
  Dodge: ['Challenger', 'Charger', 'Durango', 'Grand Caravan'],
  Ford: ['Bronco', 'Edge', 'Escape', 'Explorer', 'F-150', 'Focus', 'Fusion', 'Mustang', 'Ranger'],
  GMC: ['Acadia', 'Sierra 1500', 'Terrain', 'Yukon'],
  Honda: ['Accord', 'Civic', 'CR-V', 'Fit', 'HR-V', 'Odyssey', 'Pilot', 'Ridgeline'],
  Hyundai: ['Elantra', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Tucson'],
  Jeep: ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Wrangler'],
  Kia: ['Forte', 'K5', 'Optima', 'Sorento', 'Soul', 'Sportage', 'Telluride'],
  Lexus: ['ES', 'IS', 'NX', 'RX'],
  Mazda: ['CX-30', 'CX-5', 'CX-9', 'Mazda3', 'Mazda6', 'MX-5 Miata'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLC', 'GLE'],
  Nissan: ['Altima', 'Frontier', 'Kicks', 'Maxima', 'Pathfinder', 'Rogue', 'Sentra', 'Versa'],
  Ram: ['1500', '2500'],
  Subaru: ['Ascent', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback'],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  Toyota: ['4Runner', 'Camry', 'Corolla', 'Highlander', 'Prius', 'RAV4', 'Sienna', 'Tacoma', 'Tundra'],
  Volkswagen: ['Atlas', 'Golf', 'Jetta', 'Passat', 'Tiguan'],
}

export const vehicleMakes = Object.keys(vehicleCatalog)

const oldestModelYear = 1990
const newestModelYear = new Date().getFullYear() + 1

export const vehicleYears = Array.from(
  { length: newestModelYear - oldestModelYear + 1 },
  (_, index) => String(newestModelYear - index),
)
