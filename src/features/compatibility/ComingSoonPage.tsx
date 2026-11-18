import { CheckCheck } from 'lucide-react';
import { EmptyState, PageHeader } from '../../ui/primitives';

export function ComingSoonPage() {
  return (
    <>
      <PageHeader title="Compatibilidad" />
      <EmptyState icon={<CheckCheck size={36} strokeWidth={1.5} />} title="Disponible en la Fase 5">
        Aquí podrás registrar pruebas entre unidades, buscar material que encaje con una combinación y comprobar un código concreto.
      </EmptyState>
    </>
  );
}
