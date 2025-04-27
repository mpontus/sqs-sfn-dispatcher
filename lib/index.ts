import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';

export interface SqsSfnDispatcherProps {
  sqsQueue: sqs.IQueue;
  sfnStateMachine: sfn.IStateMachine;
}

export class SqsSfnDispatcher extends Construct {

  constructor(scope: Construct, id: string, props: SqsSfnDispatcherProps = {}) {
    super(scope, id);

    // Define construct contents here

    // example resource
    // const queue = new sqs.Queue(this, 'SqsSfnDispatcherQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
