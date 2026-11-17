/* Alternative textuelle obligatoire pour chaque carte et graphique. */
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
export const DataAlternative = ({ label = 'Voir les données (tableau)', children }: { label?: string; children: ReactNode }) => (
  <details className="data-alt"><summary><Icon name="table" size={14} /><span>{label}</span></summary>{children}</details>
);
