import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { SingletonStateMachine } from "../lib/singleton-state-machine";

describe("SingletonStateMachine", () => {
  test("creates a new state machine when one does not exist", () => {
    // GIVEN
    const app = new App();
    const stack = new Stack(app, "TestStack");

    // Define a simple state machine definition
    const passState = new sfn.Pass(stack, "PassState");

    // WHEN
    const stateMachine = SingletonStateMachine.getOrCreate(
      stack,
      "TestStateMachine",
      {
        uuid: "test-uuid-123",
        definitionBody: sfn.DefinitionBody.fromChainable(passState),
        stateMachineName: "TestStateMachine",
      }
    );

    // THEN
    expect(stateMachine).toBeDefined();

    // Verify the state machine was created with the correct properties
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "TestStateMachine",
    });
  });

  test("returns existing state machine when one exists with the same UUID", () => {
    // GIVEN
    const app = new App();
    const stack = new Stack(app, "TestStack");

    // Define simple state machine definitions
    const passState1 = new sfn.Pass(stack, "PassState");
    const passState2 = new sfn.Pass(stack, "AnotherPassState");

    const uuid = "test-uuid-456";
    const uniqueId = `SingletonStateMachine-${uuid}`;

    // WHEN - Create the first instance
    const firstStateMachine = SingletonStateMachine.getOrCreate(
      stack,
      "FirstStateMachine",
      {
        uuid,
        definitionBody: sfn.DefinitionBody.fromChainable(passState1),
        stateMachineName: "FirstStateMachine",
      }
    );

    // Create a second instance with the same UUID
    const secondStateMachine = SingletonStateMachine.getOrCreate(
      stack,
      "SecondStateMachine",
      {
        uuid,
        definitionBody: sfn.DefinitionBody.fromChainable(passState2),
        stateMachineName: "SecondStateMachine",
      }
    );

    // THEN - Both references should point to the same state machine
    expect(firstStateMachine).toBe(secondStateMachine);

    // Verify only one state machine was created
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

    // The name should be from the first state machine since that's the one that was created
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "FirstStateMachine",
    });

    // Verify the logical ID matches our expected pattern with the UUID
    const resources = template.findResources(
      "AWS::StepFunctions::StateMachine"
    );
    const logicalIds = Object.keys(resources);
    expect(logicalIds.length).toBe(1);
    expect(logicalIds[0]).toContain(uniqueId.replace(/-/g, "")); // CDK removes hyphens from logical IDs
  });

  test("creates different state machines for different UUIDs", () => {
    // GIVEN
    const app = new App();
    const stack = new Stack(app, "TestStack");

    // Define simple state machine definitions
    const passState1 = new sfn.Pass(stack, "PassState1");
    const passState2 = new sfn.Pass(stack, "PassState2");

    // WHEN - Create state machines with different UUIDs
    const firstStateMachine = SingletonStateMachine.getOrCreate(
      stack,
      "FirstStateMachine",
      {
        uuid: "uuid-1",
        definitionBody: sfn.DefinitionBody.fromChainable(passState1),
        stateMachineName: "FirstStateMachine",
      }
    );

    const secondStateMachine = SingletonStateMachine.getOrCreate(
      stack,
      "SecondStateMachine",
      {
        uuid: "uuid-2",
        definitionBody: sfn.DefinitionBody.fromChainable(passState2),
        stateMachineName: "SecondStateMachine",
      }
    );

    // THEN - They should be different instances
    expect(firstStateMachine).not.toBe(secondStateMachine);

    // Verify two state machines were created
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 2);

    // Both state machines should exist with their respective names
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "FirstStateMachine",
    });

    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "SecondStateMachine",
    });
  });
});
