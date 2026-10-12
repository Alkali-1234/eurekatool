import type { Metadata } from "next"
import { Geist_Mono, Outfit, Figtree } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TasksProvider } from "@/components/tasks-provider"
import { NewTaskProvider } from "@/components/new-task-dialog"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

const figtreeHeading = Figtree({ subsets: ["latin"], variable: "--font-heading" })

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "FPS Runner",
  description: "Run rstar_builder.py and umax_table_builder.py as tasks",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", outfit.variable, figtreeHeading.variable)}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <TasksProvider>
              <SidebarProvider>
                <NewTaskProvider>
                  <AppSidebar />
                  <SidebarInset className="min-w-0">{children}</SidebarInset>
                </NewTaskProvider>
              </SidebarProvider>
            </TasksProvider>
            <Toaster richColors={false} position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
