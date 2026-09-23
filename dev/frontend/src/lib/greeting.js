/**
 * Returns an appropriate Vietnamese greeting based on the time of day:
 * - 05:00 - 10:59: 'Chào buổi sáng'
 * - 11:00 - 13:59: 'Chào buổi trưa'
 * - 14:00 - 17:59: 'Chào buổi chiều'
 * - 18:00 - 04:59: 'Chào buổi tối'
 *
 * @param {Date|number} [time=new Date()] A Date instance or integer hour (0-23)
 * @returns {string} The appropriate Vietnamese greeting phrase
 */
export function getTimeBasedGreeting(time = new Date()) {
  const hour = typeof time === 'number'
    ? time
    : (time instanceof Date ? time.getHours() : new Date().getHours());

  if (hour >= 5 && hour < 11) {
    return 'Chào buổi sáng';
  }
  if (hour >= 11 && hour < 14) {
    return 'Chào buổi trưa';
  }
  if (hour >= 14 && hour < 18) {
    return 'Chào buổi chiều';
  }
  return 'Chào buổi tối';
}
