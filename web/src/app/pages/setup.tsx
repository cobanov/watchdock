import { LayoutContent, VStack, HStack } from "@astryxdesign/core/Layout"
import { Section } from "@astryxdesign/core/Section"
import { Text, Heading } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { Link } from "@astryxdesign/core/Link"
import { Center } from "@astryxdesign/core/Center"
import { CodeBlock } from "@astryxdesign/core/CodeBlock"
import { pagePad, formMax } from "@/app/lib/styles"

const stepBadge: React.CSSProperties = {
  borderRadius: "var(--radius-full)",
  backgroundColor: "var(--color-background-muted)",
  flexShrink: 0,
}

function Step({
  step,
  title,
  description,
  children,
}: {
  step: number
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Section padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          <Center width={24} height={24} style={stepBadge}>
            <Text type="supporting" weight="bold" color="primary">
              {step}
            </Text>
          </Center>
          <Heading level={2}>{title}</Heading>
        </HStack>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
        {children}
      </VStack>
    </Section>
  )
}

export function SetupPage({ onOpenNotifications }: { onOpenNotifications: () => void }) {
  return (
    <LayoutContent role="main">
      <VStack gap={6} style={{ ...pagePad, ...formMax }}>
        <VStack gap={0}>
          <Heading level={1}>Setup Guide</Heading>
          <Text type="supporting" color="secondary">
            Get dockwatch running and receive container alerts on your phone in a few
            minutes.
          </Text>
        </VStack>

        <Step
          step={1}
          title="Run dockwatch"
          description="dockwatch runs as a container and watches every other container on the machine through the Docker socket."
        >
          <CodeBlock
            code={`git clone https://github.com/cobanov/dockwatch.git
cd dockwatch
docker compose up -d --build`}
            language="bash"
            width="100%"
          />
          <Text type="supporting" color="secondary">
            The compose file mounts /var/run/docker.sock read-only and stores config in a
            named volume. Once up, the UI is served at http://localhost:9622 — the page
            you are looking at now.
          </Text>
        </Step>

        <Step
          step={2}
          title="Install the ntfy app"
          description="ntfy is a free pub-sub notification service; no account required."
        >
          <Text type="supporting" color="secondary">
            Install the app, then subscribe to a topic. On the public ntfy.sh anyone who
            knows the topic can read it, so pick something unguessable like
            dockwatch-x7q2-mertc.
          </Text>
          <HStack gap={2}>
            <Link href="https://apps.apple.com/us/app/ntfy/id1625396347" isExternalLink>
              App Store
            </Link>
            <Link href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" isExternalLink>
              Google Play
            </Link>
            <Link href="https://ntfy.sh" isExternalLink>
              ntfy.sh
            </Link>
          </HStack>
        </Step>

        <Step
          step={3}
          title="Connect dockwatch to ntfy"
          description="Point dockwatch at the same topic your phone subscribes to."
        >
          <Text type="supporting" color="secondary">
            Open the Notifications page, enter your topic, hit Save changes, then Send
            test. A notification should arrive within a second or two.
          </Text>
          <HStack>
            <Button label="Open Notifications" variant="secondary" onClick={onOpenNotifications} />
          </HStack>
        </Step>

        <Step
          step={4}
          title="Add remote hosts (optional)"
          description="Monitor Docker on other machines over SSH — nothing to install on the remote side."
        >
          <Text type="supporting" color="secondary">
            Use the + next to Hosts in the sidebar (or the Hosts page) and enter the
            machine's address and SSH user. Authenticate with an SSH key (recommended) or
            a password; your user must be able to access the Docker socket. Keys are read
            from ~/.ssh, mounted read-only into the container.
          </Text>
        </Step>
      </VStack>
    </LayoutContent>
  )
}
