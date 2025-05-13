# SQS to Step Functions Dispatcher

CDK construct for dispatching messages from AWS SQS to Step Functions state machines.

## Problem

Integrating Step Functions with Amazon SQS can be done in one of the following ways:

1. Create a task in state machine that retrieves messages from the queue before invoking processing logic.
2. Use EventBridge Pipes to connect queue with the state machine using Map state to process batched messages.

Either way, the state machine processing SQS messages can not not be focused purely on the business logic.

## Solution Architecture

```
┌─────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│         │     │              │     │                     │     │                 │
│   SQS   │────▶│ Lambda       │────▶│ Dispatcher          │────▶│ Target          │
│  Queue  │     │ Trigger      │     │ Step Function       │     │ Step Function   │
│         │     │ Function     │     │ (Map State)         │     │ (Your Logic)    │
└─────────┘     └──────────────┘     └─────────────────────┘     └─────────────────┘
                                              │
                                              │ Success/Failure tracking
                                              ▼
                                     ┌─────────────────────┐
                                     │                     │
                                     │ Delete Successfully │
                                     │ Processed Messages  │
                                     │                     │
                                     └─────────────────────┘
```

The solution uses a singleton Lambda function that retrieves messages from the queue and forwards them to the dispatcher state machine. Then the state machine processes messages in parallel, sending each message to the target state machine and deletes successfully processed messages.

## Usage

```typescript
import { SqsSfnDispatcher } from "sqs-sfn-dispatcher";

// Create a dispatcher that connects your SQS queue to your Step Function
const dispatcher = new SqsSfnDispatcher(this, "MyDispatcher", {
  source: myQueue,
  target: myStateMachine,
});
```

### Working with FIFO Queues

**Important:** The SQS-SFN Dispatcher automatically sets the batch size to 1 for FIFO queues to preserve message group ordering. This ensures that:

1. Only one message per group is processed by lambda
2. If a message fails processing, subsequent messages with the same group d will not be processed until the failed message is successfully processed

Also, don't use DLQs with FIFO queues if the order of operations is critical for your application. When a message moves to a DLQ, the queue continues processing the next message in the group, breaking the ordering guarantee.

## License

This project is licensed under the Apache License 2.0.

Copyright 2023. All rights reserved.
