export const detailsMaxLength = 600
export const questionMaxLength = 400
export const trimMaxLength = 40
export const settlementMaxLength = 500

const mileageMaxDigits = 7

export function sanitizeMileage(input: string) {
  return input
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, mileageMaxDigits)
}
