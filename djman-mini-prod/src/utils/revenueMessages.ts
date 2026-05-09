const formatCurrency = (amount: number) =>
  amount.toLocaleString('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  });

export const buildFiveWaySplitMessage = (amount: number): string => {
  const baseShareRaw = amount * 0.2;
  const baseShare = Number(baseShareRaw.toFixed(2));

  const totalFormatted = formatCurrency(amount);
  const shareFormatted = formatCurrency(baseShare);

  return (
    `Priorité confirmée (${totalFormatted}).\n` +
    `Répartition 5 x 20 % : ${shareFormatted} pour l’artiste, ${shareFormatted} pour les investisseurs, ` +
    `${shareFormatted} pour le propriétaire du jukebox, ${shareFormatted} pour le payeur, ` +
    `${shareFormatted} pour la plateforme.`
  );
};
















