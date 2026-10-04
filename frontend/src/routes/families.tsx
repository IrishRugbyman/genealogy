import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/families')({
  component: () => <Outlet />,
})
