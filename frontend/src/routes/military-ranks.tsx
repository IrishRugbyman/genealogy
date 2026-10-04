import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/military-ranks')({
  component: () => <Outlet />,
})
