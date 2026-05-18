/**
 * @file CLI script to provision Kafka topics declared in {@link KafkaTopics}.
 * @module ghostless/scripts
 */

import { Kafka } from 'kafkajs';
import { KafkaTopics } from '../libs/contracts/src/topics';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');

/** Connects to Kafka admin API and creates any missing contract topics. */
async function main(): Promise<void> {
  const kafka = new Kafka({ clientId: 'ghostless-admin', brokers });
  const admin = kafka.admin();
  await admin.connect();

  const topics = Object.values(KafkaTopics).map((topic) => ({
    topic,
    numPartitions: 3,
    replicationFactor: 1,
  }));

  const existing = await admin.listTopics();
  const toCreate = topics.filter((t) => !existing.includes(t.topic));

  if (toCreate.length > 0) {
    await admin.createTopics({ topics: toCreate });
    console.log('Created topics:', toCreate.map((t) => t.topic).join(', '));
  } else {
    console.log('All topics already exist');
  }

  await admin.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
